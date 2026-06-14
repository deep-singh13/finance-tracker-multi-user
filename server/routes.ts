import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  requireAuth, requireAdmin, handleLogin, handleLogout, handleMe, handleRegister,
  handleChangePassword, loginRateLimiter,
} from "./auth";
import { registerAdminRoutes } from "./admin";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Auth (public) ──
  app.post("/api/auth/register", loginRateLimiter, handleRegister);
  app.post("/api/auth/login", loginRateLimiter, handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.get("/api/auth/me", handleMe);

  // ── Everything below requires a session ──
  app.use("/api", requireAuth);

  // Self-service password change (any logged-in user).
  app.post("/api/auth/change-password", handleChangePassword);

  // ── Admin ──
  registerAdminRoutes(app, requireAdmin);

  const uid = (req: Request) => req.userId!;

  // ── Expenses ──
  app.get(api.expenses.list.path, async (req, res) => res.json(await storage.getExpenses(uid(req))));
  app.get(api.expenses.get.path, async (req, res) => {
    const e = await storage.getExpense(uid(req), Number(req.params.id));
    if (!e) return res.status(404).json({ message: "Expense not found" });
    res.json(e);
  });
  app.post(api.expenses.create.path, async (req, res) => {
    try {
      const input = api.expenses.create.input.parse(req.body);
      res.status(201).json(await storage.createExpense(uid(req), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });
  app.put(api.expenses.update.path, async (req, res) => {
    try {
      const input = api.expenses.update.input.parse(req.body);
      const e = await storage.updateExpense(uid(req), Number(req.params.id), input);
      if (!e) return res.status(404).json({ message: "Expense not found" });
      res.json(e);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });
  app.delete(api.expenses.delete.path, async (req, res) => {
    await storage.deleteExpense(uid(req), Number(req.params.id));
    res.status(204).send();
  });

  // ── Budgets ──
  app.get(api.budgets.get.path, async (req, res) => {
    const b = await storage.getBudget(uid(req), req.params.month);
    if (!b) return res.status(404).json({ message: "Budget not found" });
    res.json(b);
  });
  app.post(api.budgets.set.path, async (req, res) => {
    try {
      const input = api.budgets.set.input.parse(req.body);
      res.json(await storage.setBudget(uid(req), input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  // ── Investments ──
  app.get("/api/investments", async (req, res) => res.json(await storage.getInvestments(uid(req))));
  app.post("/api/investments", async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1), type: z.string().min(1), amount: z.coerce.number().positive(), startDate: z.string().optional().nullable(), notes: z.string().optional().nullable(), isActive: z.boolean().default(true) });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createInvestment(uid(req), { ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.put("/api/investments/:id", async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1).optional(), type: z.string().min(1).optional(), amount: z.coerce.number().positive().optional(), startDate: z.string().optional().nullable(), notes: z.string().optional().nullable(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      const row = await storage.updateInvestment(uid(req), Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.delete("/api/investments/:id", async (req, res) => { await storage.deleteInvestment(uid(req), Number(req.params.id)); res.status(204).send(); });

  // ── Subscriptions ──
  app.get("/api/subscriptions", async (req, res) => res.json(await storage.getSubscriptions(uid(req))));
  app.post("/api/subscriptions", async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1), amount: z.coerce.number().positive(), billingDay: z.coerce.number().int().min(1).max(28).default(1), category: z.string().min(1), isActive: z.boolean().default(true) });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createSubscription(uid(req), { ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.put("/api/subscriptions/:id", async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1).optional(), amount: z.coerce.number().positive().optional(), billingDay: z.coerce.number().int().min(1).max(28).optional(), category: z.string().min(1).optional(), isActive: z.boolean().optional() });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      const row = await storage.updateSubscription(uid(req), Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.delete("/api/subscriptions/:id", async (req, res) => { await storage.deleteSubscription(uid(req), Number(req.params.id)); res.status(204).send(); });

  app.post("/api/subscriptions/process", async (req, res) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const todayDay = now.getDate();
    const allSubs = await storage.getSubscriptions(uid(req));
    let billed = 0;
    for (const sub of allSubs) {
      if (!sub.isActive || sub.lastBilledMonth === currentMonth || sub.billingDay > todayDay) continue;
      const expenseDate = `${currentMonth}-${String(sub.billingDay).padStart(2, "0")}`;
      await storage.createExpense(uid(req), { amount: sub.amount, description: sub.name, category: sub.category, date: expenseDate, source: "subscription", externalId: `sub_${sub.id}_${currentMonth}` });
      await storage.updateSubscription(uid(req), sub.id, { lastBilledMonth: currentMonth });
      billed++;
    }
    res.json({ billed });
  });

  // ── Income ──
  app.get("/api/income", async (req, res) => res.json(await storage.getIncome(uid(req))));
  app.post("/api/income", async (req, res) => {
    try {
      const schema = z.object({ amount: z.coerce.number().positive(), description: z.string().min(1), source: z.enum(["salary", "freelance", "investment", "other"]).default("other"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
      const data = schema.parse(req.body);
      res.status(201).json(await storage.createIncome(uid(req), { ...data, amount: Math.round(data.amount * 100) }));
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.put("/api/income/:id", async (req, res) => {
    try {
      const schema = z.object({ amount: z.coerce.number().positive().optional(), description: z.string().min(1).optional(), source: z.enum(["salary", "freelance", "investment", "other"]).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
      const data = schema.parse(req.body);
      if (data.amount !== undefined) data.amount = Math.round(data.amount * 100);
      const row = await storage.updateIncome(uid(req), Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message }); throw err; }
  });
  app.delete("/api/income/:id", async (req, res) => { await storage.deleteIncome(uid(req), Number(req.params.id)); res.status(204).send(); });

  return httpServer;
}
