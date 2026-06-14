import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { userStore } from "./users";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts. Try again in 15 minutes." },
});

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, _ . -"),
  password: z.string().min(8).max(128),
});

// ── Middleware ───────────────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const s = req.session as any;
  if (s.userId) { req.userId = s.userId; req.userRole = s.role; return next(); }
  return res.status(401).json({ message: "Unauthorized" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).role === "admin") return next();
  return res.status(403).json({ message: "Forbidden" });
}

// ── Register ─────────────────────────────────────────────────────────────────
// Open only while zero users exist (creates first admin). Otherwise admin-only.
// Bootstrap-only: this endpoint creates the FIRST account (the admin) while the
// users table is empty, and logs them in. Once any user exists it is closed —
// all further accounts are created by an admin via POST /api/admin/users.
export async function handleRegister(req: Request, res: Response) {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

  // Atomic: creates the first user as admin, or returns null if a user already
  // exists (registration closed). The check + insert share one locked transaction,
  // so concurrent first-time registrations cannot both succeed.
  const user = await userStore.createInitialAdmin({ username: parsed.data.username, password: parsed.data.password });
  if (!user) {
    return res.status(403).json({ message: "Registration is closed. Ask an admin to create your account." });
  }

  return req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: "Session error" });
    (req.session as any).userId = user.id;
    (req.session as any).role = user.role;
    req.session.save((e) => e ? res.status(500).json({ message: "Session error" }) : res.json({ ok: true, username: user.username, role: user.role }));
  });
}

// ── Login ────────────────────────────────────────────────────────────────────
export async function handleLogin(req: Request, res: Response) {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ message: "Incorrect username or password" });

  const user = await userStore.verify(parsed.data.username, parsed.data.password);
  if (!user) return res.status(401).json({ message: "Incorrect username or password" });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: "Session error" });
    (req.session as any).userId = user.id;
    (req.session as any).role = user.role;
    req.session.save((e) => e ? res.status(500).json({ message: "Session error" }) : res.json({ ok: true, username: user.username, role: user.role }));
  });
}

// ── Change password (self-service, requires an active session) ───────────────
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function handleChangePassword(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

  const userId = (req.session as any).userId as number;
  const ok = await userStore.verifyPassword(userId, parsed.data.currentPassword);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ message: "New password must be different from the current one" });
  }

  await userStore.setPassword(userId, parsed.data.newPassword);
  return res.status(204).send();
}

// ── Logout ───────────────────────────────────────────────────────────────────
export function handleLogout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) console.error("Session destroy error:", err);
    res.clearCookie("sid");
    return res.json({ ok: true });
  });
}

// ── Me ───────────────────────────────────────────────────────────────────────
export async function handleMe(req: Request, res: Response) {
  const s = req.session as any;
  if (!s.userId) {
    const needsBootstrap = (await userStore.count()) === 0;
    return res.status(401).json({ authenticated: false, needsBootstrap });
  }
  const user = await userStore.findById(s.userId);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ authenticated: false, needsBootstrap: false }); }
  return res.json({ authenticated: true, username: user.username, role: user.role });
}
