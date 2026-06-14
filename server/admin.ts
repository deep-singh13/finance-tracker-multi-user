import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { userStore } from "./users";
import { storage } from "./storage";

const newUserSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
});

export function registerAdminRoutes(app: Express, requireAdmin: RequestHandler) {
  // List users with per-user transaction counts.
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    const users = await userStore.list();
    const out = await Promise.all(users.map(async (u) => {
      const counts = await storage.transactionCounts(u.id);
      return {
        id: u.id, username: u.username, role: u.role,
        createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        expenseCount: counts.expenses, incomeCount: counts.income,
      };
    }));
    res.json(out);
  });

  // Create a user (admin invite). Role is always 'user' (not first user).
  app.post("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    const parsed = newUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    if (await userStore.findByUsername(parsed.data.username)) return res.status(409).json({ message: "Username already taken" });
    const u = await userStore.create({ username: parsed.data.username, password: parsed.data.password });
    res.status(201).json({ id: u.id, username: u.username, role: u.role });
  });

  // Delete a user (cascades to their data). Cannot delete self.
  app.delete("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (id === (req.session as any).userId) return res.status(400).json({ message: "You cannot delete your own account" });
    const target = await userStore.findById(id);
    if (!target) return res.status(404).json({ message: "User not found" });
    await userStore.remove(id);
    res.status(204).send();
  });

  // Reset a user's password.
  app.put("/api/admin/users/:id/password", requireAdmin, async (req: Request, res: Response) => {
    const schema = z.object({ password: z.string().min(8).max(128) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const target = await userStore.findById(Number(req.params.id));
    if (!target) return res.status(404).json({ message: "User not found" });
    await userStore.setPassword(target.id, parsed.data.password);
    res.status(204).send();
  });

  // Promote/demote. Cannot demote the last admin.
  app.put("/api/admin/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
    const schema = z.object({ role: z.enum(["user", "admin"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const target = await userStore.findById(Number(req.params.id));
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "admin" && parsed.data.role === "user" && (await userStore.countAdmins()) <= 1) {
      return res.status(400).json({ message: "Cannot demote the last admin" });
    }
    await userStore.setRole(target.id, parsed.data.role);
    res.status(204).send();
  });
}
