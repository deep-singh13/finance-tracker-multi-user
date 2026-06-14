import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

// ── Rate limiter ────────────────────────────────────────────────────────────
// 5 attempts per 15 minutes per IP. With a 4-digit PIN (10,000 combos) this
// means exhausting all combinations takes ~20 days — acceptable for personal use.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts
  message: { message: "Too many attempts. Try again in 15 minutes." },
});

// ── Auth middleware ──────────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).authenticated) return next();
  return res.status(401).json({ message: "Unauthorized" });
}

// ── Login handler ────────────────────────────────────────────────────────────
export async function handleLogin(req: Request, res: Response) {
  const { pin } = req.body as { pin?: string };

  // Validate: must be exactly 4 digits
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(401).json({ message: "Incorrect PIN" });
  }

  const hash = process.env.AUTH_PIN_HASH;
  if (!hash) {
    console.error("AUTH_PIN_HASH env var is not set");
    return res.status(503).json({ message: "Authentication not configured" });
  }

  // bcrypt compare — constant-time, safe against timing attacks
  const match = await bcrypt.compare(pin, hash);
  if (!match) {
    // Generic message — don't reveal whether PIN format was wrong vs. wrong value
    return res.status(401).json({ message: "Incorrect PIN" });
  }

  // Regenerate session to prevent session fixation attacks
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: "Session error" });
    (req.session as any).authenticated = true;
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ message: "Session error" });
      return res.json({ ok: true });
    });
  });
}

// ── Logout handler ───────────────────────────────────────────────────────────
export function handleLogout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) console.error("Session destroy error:", err);
    res.clearCookie("sid"); // matches the cookie name set in index.ts
    return res.json({ ok: true });
  });
}

// ── Me handler (auth check for client) ──────────────────────────────────────
export function handleMe(req: Request, res: Response) {
  if ((req.session as any).authenticated) return res.json({ authenticated: true });
  return res.status(401).json({ authenticated: false });
}
