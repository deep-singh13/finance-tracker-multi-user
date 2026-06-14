import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { requireAuth, handleLogin, handleLogout, handleMe, loginRateLimiter } from "./auth";

const parsedTransactionSchema = z.object({
  amount: z.number().positive(),       // in paise
  description: z.string().min(1),
  category: z.string().default("Miscellaneous"), // for debits
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalId: z.string().min(1),       // Gmail message ID for deduplication
  type: z.enum(["debit", "credit"]).default("debit"),
  incomeSource: z.enum(["salary", "freelance", "investment", "other"]).default("other"), // for credits
});

const syncPayloadSchema = z.object({
  transactions: z.array(parsedTransactionSchema),
});

// Staging store lives in memory (ephemeral — survives only while the server is up)
interface StagedTransaction {
  tempId: string;
  amount: number;
  description: string;
  category: string;       // used for debits
  date: string;
  externalId: string;
  type: "debit" | "credit";
  incomeSource: "salary" | "freelance" | "investment" | "other"; // used for credits
}
let staged: StagedTransaction[] = [];

// Helper: check X-Sync-Key header against SYNC_API_KEY env var.
// Returns true if the request is allowed, false (and sends 401) if not.
function checkSyncKey(req: Request, res: Response): boolean {
  const apiKey = process.env.SYNC_API_KEY;
  if (apiKey && req.headers["x-sync-key"] !== apiKey) {
    res.status(401).json({ message: "Invalid or missing X-Sync-Key header" });
    return false;
  }
  return true;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Auth routes (public — no requireAuth) ──────────────────────────────────
  app.post("/api/auth/login", loginRateLimiter, handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.get("/api/auth/me", handleMe);

  // ── Gmail sync routes (public — protected by X-Sync-Key, not session) ──────
  // Called by the /sync-gmail Claude Code skill which has no browser session.
  // SYNC_API_KEY env var is optional; if set, the skill must send it as
  // X-Sync-Key header. These are intentionally outside the requireAuth wall.

  // GET /api/gmail/status — used by both the dashboard (session) and the sync skill (X-Sync-Key).
  // Allow if either auth is valid; block only when neither is present.
  app.get("/api/gmail/status", async (req, res) => {
    const hasSession = (req.session as any).authenticated;
    if (!hasSession && !checkSyncKey(req, res)) return;
    const record = await storage.getGmailSync();
    res.json({ lastSyncedAt: record?.lastSyncedAt ?? null });
  });

  // POST /api/gmail/sync — direct import (skill pushes, no review step)
  app.post("/api/gmail/sync", async (req, res) => {
    if (!checkSyncKey(req, res)) return;
    try {
      const { transactions } = syncPayloadSchema.parse(req.body);
      let imported = 0;
      for (const tx of transactions) {
        const exists = await storage.expenseExistsByExternalId(tx.externalId);
        if (exists) continue;
        await storage.createExpense({
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          date: tx.date,
          source: "gmail",
          externalId: tx.externalId,
        });
        imported++;
      }
      await storage.upsertGmailSync({ lastSyncedAt: new Date() });
      return res.json({ imported, total: transactions.length, lastSyncedAt: new Date() });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // POST /api/gmail/stage — two-phase import: skill stages, user reviews, then commits
  app.post("/api/gmail/stage", async (req, res) => {
    if (!checkSyncKey(req, res)) return;
    try {
      const { transactions } = syncPayloadSchema.parse(req.body);
      const newTxs: StagedTransaction[] = [];
      for (const tx of transactions) {
        // Check the right table based on type
        const exists = tx.type === "credit"
          ? await storage.incomeExistsByExternalId(tx.externalId)
          : await storage.expenseExistsByExternalId(tx.externalId);
        if (!exists) newTxs.push({ tempId: randomUUID(), ...tx });
      }
      staged = newTxs;
      return res.json({ staged: newTxs.length, total: transactions.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ── All remaining /api/* routes require a valid browser session ─────────────
  app.use("/api", requireAuth);

  // ── Expenses ────────────────────────────────────────────────────────────────
  app.get(api.expenses.list.path, async (_req, res) => {
    res.json(await storage.getExpenses());
  });

  app.get(api.expenses.get.path, async (req, res) => {
    const expense = await storage.getExpense(Number(req.params.id));
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    res.json(expense);
  });

  app.post(api.expenses.create.path, async (req, res) => {
    try {
      const input = api.expenses.create.input.parse(req.body);
      const expense = await storage.createExpense(input);
      res.status(201).json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  app.put(api.expenses.update.path, async (req, res) => {
    try {
      const input = api.expenses.update.input.parse(req.body);
      const expense = await storage.updateExpense(Number(req.params.id), input);
      if (!expense) return res.status(404).json({ message: "Expense not found" });
      res.json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  app.delete(api.expenses.delete.path, async (req, res) => {
    await storage.deleteExpense(Number(req.params.id));
    res.status(204).send();
  });

  // ── Budgets ─────────────────────────────────────────────────────────────────
  app.get(api.budgets.get.path, async (req, res) => {
    const budget = await storage.getBudget(req.params.month);
    if (!budget) return res.status(404).json({ message: "Budget not found" });
    res.json(budget);
  });

  app.post(api.budgets.set.path, async (req, res) => {
    try {
      const input = api.budgets.set.input.parse(req.body);
      res.json(await storage.setBudget(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  // ── Gmail staging review (browser only — session protected) ─────────────────
  // GET /api/gmail/staged — list staged transactions for review in the UI
  app.get("/api/gmail/staged", (_req, res) => {
    res.json(staged);
  });

  // PUT /api/gmail/staged/:tempId — edit a staged transaction before committing
  app.put("/api/gmail/staged/:tempId", (req, res) => {
    const idx = staged.findIndex(t => t.tempId === req.params.tempId);
    if (idx === -1) return res.status(404).json({ message: "Not found" });
    const stagedEditSchema = z.object({
      amount: z.number().positive().optional(),
      description: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      incomeSource: z.enum(["salary", "freelance", "investment", "other"]).optional(),
    });
    let parsed: z.infer<typeof stagedEditSchema>;
    try {
      parsed = stagedEditSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
    if (parsed.amount !== undefined) staged[idx].amount = parsed.amount;
    if (parsed.description !== undefined) staged[idx].description = parsed.description;
    if (parsed.category !== undefined) staged[idx].category = parsed.category;
    if (parsed.date !== undefined) staged[idx].date = parsed.date;
    if (parsed.incomeSource !== undefined) staged[idx].incomeSource = parsed.incomeSource;
    res.json(staged[idx]);
  });

  // DELETE /api/gmail/staged/:tempId — discard a staged transaction
  app.delete("/api/gmail/staged/:tempId", (req, res) => {
    const idx = staged.findIndex(t => t.tempId === req.params.tempId);
    if (idx === -1) return res.status(404).json({ message: "Not found" });
    staged.splice(idx, 1);
    res.status(204).send();
  });

  // POST /api/gmail/commit — save all staged transactions to DB and clear staging
  app.post("/api/gmail/commit", async (_req, res) => {
    let imported = 0;
    for (const tx of staged) {
      if (tx.type === "credit") {
        const exists = await storage.incomeExistsByExternalId(tx.externalId);
        if (!exists) {
          await storage.createIncome({
            amount: tx.amount,
            description: tx.description,
            source: tx.incomeSource,
            date: tx.date,
            externalId: tx.externalId,
          });
          imported++;
        }
      } else {
        const exists = await storage.expenseExistsByExternalId(tx.externalId);
        if (!exists) {
          await storage.createExpense({
            amount: tx.amount,
            description: tx.description,
            category: tx.category,
            date: tx.date,
            source: "gmail",
            externalId: tx.externalId,
          });
          imported++;
        }
      }
    }
    staged = [];
    await storage.upsertGmailSync({ lastSyncedAt: new Date() });
    res.json({ imported });
  });

  // ── Investments ─────────────────────────────────────────────────────────────
  app.get("/api/investments", async (_req, res) => {
    res.json(await storage.getInvestments());
  });

  app.post("/api/investments", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        amount: z.coerce.number().positive(),
        startDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().default(true),
      });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createInvestment({ ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/investments/:id", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        type: z.string().min(1).optional(),
        amount: z.coerce.number().positive().optional(),
        startDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      res.json(await storage.updateInvestment(Number(req.params.id), data));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/investments/:id", async (req, res) => {
    await storage.deleteInvestment(Number(req.params.id));
    res.status(204).send();
  });

  // ── Subscriptions ───────────────────────────────────────────────────────────
  app.get("/api/subscriptions", async (_req, res) => {
    res.json(await storage.getSubscriptions());
  });

  app.post("/api/subscriptions", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        amount: z.coerce.number().positive(),
        billingDay: z.coerce.number().int().min(1).max(28).default(1),
        category: z.string().min(1),
        isActive: z.boolean().default(true),
      });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createSubscription({ ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/subscriptions/:id", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        amount: z.coerce.number().positive().optional(),
        billingDay: z.coerce.number().int().min(1).max(28).optional(),
        category: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      res.json(await storage.updateSubscription(Number(req.params.id), data));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/subscriptions/:id", async (req, res) => {
    await storage.deleteSubscription(Number(req.params.id));
    res.status(204).send();
  });

  // POST /api/subscriptions/process — auto-bill active subs whose billing day has passed
  // Called silently by the client on every app load.
  app.post("/api/subscriptions/process", async (_req, res) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const todayDay = now.getDate();
    const allSubs = await storage.getSubscriptions();

    let billed = 0;
    for (const sub of allSubs) {
      if (!sub.isActive) continue;
      if (sub.lastBilledMonth === currentMonth) continue;
      if (sub.billingDay > todayDay) continue;

      const expenseDate = `${currentMonth}-${String(sub.billingDay).padStart(2, "0")}`;
      await storage.createExpense({
        amount: sub.amount,
        description: sub.name,
        category: sub.category,
        date: expenseDate,
        source: "subscription",
        externalId: `sub_${sub.id}_${currentMonth}`,
      });
      await storage.updateSubscription(sub.id, { lastBilledMonth: currentMonth });
      billed++;
    }

    res.json({ billed });
  });

  // ── Income ──────────────────────────────────────────────────────────────────
  app.get("/api/income", async (_req, res) => {
    res.json(await storage.getIncome());
  });

  app.post("/api/income", async (req, res) => {
    try {
      const schema = z.object({
        amount: z.coerce.number().positive(),
        description: z.string().min(1),
        source: z.enum(["salary", "freelance", "investment", "other"]).default("other"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createIncome({ ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/income/:id", async (req, res) => {
    try {
      const schema = z.object({
        amount: z.coerce.number().positive().optional(),
        description: z.string().min(1).optional(),
        source: z.enum(["salary", "freelance", "investment", "other"]).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      res.json(await storage.updateIncome(Number(req.params.id), data));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/income/:id", async (req, res) => {
    await storage.deleteIncome(Number(req.params.id));
    res.status(204).send();
  });

  // ── Seed initial data ────────────────────────────────────────────────────────
  const existingExpenses = await storage.getExpenses();
  if (existingExpenses.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    await storage.createExpense({ amount: 1250, description: "Lunch at cafe", category: "Food", date: today });
    await storage.createExpense({ amount: 5500, description: "Movie tickets", category: "Entertainment", date: today });
    await storage.createExpense({ amount: 15000, description: "Electric bill", category: "Amenities", date: today });
  }

  return httpServer;
}
