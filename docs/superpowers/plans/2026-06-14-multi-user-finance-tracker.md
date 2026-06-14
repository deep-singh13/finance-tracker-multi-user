# Multi-user Finance Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the single-user finance tracker into a multi-user app with username/password accounts, per-user data isolation, and an admin panel; remove Gmail import and the widget worker.

**Architecture:** Keep the existing React + Express + Drizzle + Neon stack. Add a `users` table and a `userId` foreign key on every data table. Scope every storage query by `userId`. Replace PIN auth with username/password (bcrypt) sessions carrying a `role`. Add admin-only routes + UI. The first registered user becomes admin; afterward only admins create accounts.

**Tech Stack:** TypeScript, Express, Drizzle ORM, Neon Postgres, `connect-pg-simple` (Postgres sessions), `bcryptjs`, React + wouter + TanStack Query + shadcn/ui, Vitest + Supertest (new test tooling).

---

## File Structure

**Removed:**
- `server/gmail.ts`, `client/src/components/GmailSyncButton.tsx`, `client/src/components/GmailSyncModal.tsx`
- `widget-worker/` (entire directory), `script/` widget references if any
- `gmailSync` table from `shared/schema.ts`; all `/api/gmail/*` routes from `server/routes.ts`
- Old migration `migrations/0001_add_gmail_sync.sql` is superseded (fresh DB; migrations regenerated)

**Created:**
- `server/users.ts` — user storage (create/find/list/delete/update/count) + password hashing helpers
- `server/admin.ts` — admin route handlers
- `client/src/pages/Register.tsx` — first-admin bootstrap + (later) shows closed state
- `client/src/pages/Admin.tsx` — admin panel
- `client/src/hooks/use-admin.ts` — admin data hooks
- `tests/` — Vitest tests + `tests/helpers/` test DB harness
- `vitest.config.ts`

**Modified:**
- `shared/schema.ts` — add `users`; add `userId` to all data tables; drop `gmailSync`
- `server/auth.ts` — username/password login, register, role-aware `me`, `requireAuth` (sets `userId`/`role`), `requireAdmin`
- `server/storage.ts` — every method takes `userId`; queries scoped
- `server/routes.ts` — pass `req.userId`; mount auth + admin routes; remove gmail routes
- `server/index.ts` — switch session store to `connect-pg-simple`
- `client/src/App.tsx` — add `/admin` route, role from auth, user menu, remove gmail UI
- `client/src/hooks/use-auth.ts` — return `{ username, role }`
- `client/src/pages/Login.tsx` — username + password form (replace PIN)
- `package.json` — add `test` script + vitest/supertest dev deps

---

## Phase 0 — Fork cleanup & test tooling

### Task 0.1: Remove Gmail and widget code

**Files:**
- Delete: `server/gmail.ts`, `client/src/components/GmailSyncButton.tsx`, `client/src/components/GmailSyncModal.tsx`, `widget-worker/` (whole dir)

- [ ] **Step 1: Delete the files/dirs**

```bash
git rm server/gmail.ts client/src/components/GmailSyncButton.tsx client/src/components/GmailSyncModal.tsx
git rm -r widget-worker
```

- [ ] **Step 2: Find remaining references**

Run: `grep -rn "gmail\|Gmail\|GmailSync\|widget-worker\|SYNC_API_KEY\|WIDGET_API_KEY" server client shared script package.json | grep -v node_modules`
Expected: only references inside `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `client/src/App.tsx` (handled in later tasks). No references to the deleted component files elsewhere.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: remove gmail import and widget worker"
```

### Task 0.2: Add Vitest + Supertest tooling

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Install dev deps**

Run: `npm install -D vitest supertest @types/supertest`
Expected: installs without error.

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    fileParallelism: false, // tests share one DB; run serially
    include: ["tests/**/*.test.ts"],
    hookTimeout: 60000,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest + supertest tooling"
```

### Task 0.3: Test database harness

A real Postgres is required for isolation tests. Use a separate empty database via `TEST_DATABASE_URL` (e.g. a Neon branch or local Docker `postgres`). The harness pushes the current Drizzle schema before tests and truncates tables between tests.

**Files:**
- Create: `tests/helpers/global-setup.ts`, `tests/helpers/db.ts`

- [ ] **Step 1: Write `tests/helpers/global-setup.ts`**

```ts
import { execSync } from "child_process";

// Runs once before the whole suite. Pushes the Drizzle schema into the
// test database so tables exist. Requires TEST_DATABASE_URL to be set.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run tests");
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
```

- [ ] **Step 2: Write `tests/helpers/db.ts`**

```ts
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must be set to run tests");

export const testPool = new Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: true } });
export const testDb = drizzle(testPool, { schema });

// Wipe all rows between tests. Order respects FKs (cascade also covers it).
export async function resetDb() {
  await testPool.query(
    'TRUNCATE expenses, income, budgets, investments, subscriptions, users RESTART IDENTITY CASCADE'
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/global-setup.ts tests/helpers/db.ts
git commit -m "test: add postgres test harness"
```

> **Note for executor:** Tasks that run `npm test` require `TEST_DATABASE_URL` in the environment. If unset, ask the user for an empty test database (a Neon branch is ideal) before proceeding. The `users` table referenced in TRUNCATE is created in Task 1.1.

---

## Phase 1 — Schema

### Task 1.1: Add `users` table and `userId` columns; drop `gmailSync`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Replace the schema file contents**

Replace the whole of `shared/schema.ts` with:

```ts
import { pgTable, text, serial, timestamp, date, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  date: date("date").notNull(),
  source: text("source").default("manual").notNull(), // 'manual' | 'subscription'
  externalId: text("external_id"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("expenses_user_idx").on(t.userId) }));

export const income = pgTable("income", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull().default("other"),
  date: date("date").notNull(),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("income_user_idx").on(t.userId) }));

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  amount: integer("amount").notNull(),
}, (t) => ({ userMonth: uniqueIndex("budgets_user_month_idx").on(t.userId, t.month) }));

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  startDate: date("start_date"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("investments_user_idx").on(t.userId) }));

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  billingDay: integer("billing_day").default(1).notNull(),
  category: text("category").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastBilledMonth: text("last_billed_month"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("subscriptions_user_idx").on(t.userId) }));

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, userId: true }).extend({
  tags: z.array(z.string()).optional().nullable(),
});
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, userId: true });
export const insertInvestmentSchema = createInsertSchema(investments).omit({ id: true, createdAt: true, userId: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, userId: true });
export const insertIncomeSchema = createInsertSchema(income).omit({ id: true, createdAt: true, userId: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Income = typeof income.$inferSelect;
export type InsertIncome = z.infer<typeof insertIncomeSchema>;

export type CreateExpenseRequest = InsertExpense;
export type UpdateExpenseRequest = Partial<InsertExpense>;
export type ExpenseResponse = Expense;
export type ExpensesListResponse = Expense[];
```

- [ ] **Step 2: Update `shared/routes.ts` types**

In `shared/routes.ts`, the `insertExpenseSchema` import still works (now omits `userId`). No change needed unless `tsc` complains. Run: `npx tsc --noEmit` after later tasks to confirm.

- [ ] **Step 3: Regenerate migrations for fresh DB**

```bash
rm -f migrations/0000_*.sql migrations/0001_*.sql migrations/0002_*.sql
rm -rf migrations/meta
npx drizzle-kit generate
```
Expected: a single new migration reflecting the full schema with users + userId FKs.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts migrations
git commit -m "feat: add users table and per-user scoping to schema"
```

---

## Phase 2 — Auth backend

### Task 2.1: User storage module

**Files:**
- Create: `server/users.ts`
- Test: `tests/users.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/users.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { userStore } from "../server/users";

beforeEach(async () => { await resetDb(); });

describe("userStore", () => {
  it("creates the first user as admin and hashes the password", async () => {
    const u = await userStore.create({ username: "alice", password: "secret123" });
    expect(u.username).toBe("alice");
    expect(u.role).toBe("admin"); // first user
    expect((u as any).passwordHash).not.toBe("secret123");
  });

  it("creates subsequent users as 'user'", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    const bob = await userStore.create({ username: "bob", password: "secret123" });
    expect(bob.role).toBe("user");
  });

  it("verifies passwords", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    expect(await userStore.verify("alice", "secret123")).toBeTruthy();
    expect(await userStore.verify("alice", "wrong")).toBeNull();
  });

  it("rejects duplicate usernames", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    await expect(userStore.create({ username: "alice", password: "x2345678" }))
      .rejects.toThrow();
  });

  it("counts, lists, and deletes users", async () => {
    const a = await userStore.create({ username: "alice", password: "secret123" });
    await userStore.create({ username: "bob", password: "secret123" });
    expect(await userStore.count()).toBe(2);
    const list = await userStore.list();
    expect(list.map(u => u.username).sort()).toEqual(["alice", "bob"]);
    await userStore.remove(a.id);
    expect(await userStore.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/users.test.ts`
Expected: FAIL — cannot find module `../server/users`.

- [ ] **Step 3: Write `server/users.ts`**

> The module imports `db` from `./db`. For tests we point `DATABASE_URL` at the test DB. The executor must run tests with `DATABASE_URL=$TEST_DATABASE_URL` so `server/db.ts` connects to the test database. Add this to the `test` script env or export it in the shell.

```ts
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, type User } from "@shared/schema";
import { eq, sql, asc } from "drizzle-orm";

const SALT_ROUNDS = 10;

export interface CreateUserInput { username: string; password: string; role?: "user" | "admin"; }

export const userStore = {
  async count(): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row.n;
  },

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    // First user ever becomes admin unless an explicit role is given.
    const role = input.role ?? ((await this.count()) === 0 ? "admin" : "user");
    const [user] = await db.insert(users)
      .values({ username: input.username, passwordHash, role })
      .returning();
    return user;
  },

  async findByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  async findById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  // Returns the user on success, null on failure. Updates lastLoginAt on success.
  async verify(username: string, password: string): Promise<User | null> {
    const user = await this.findByUsername(username);
    if (!user) { await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinv"); return null; } // constant-time-ish
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return user;
  },

  async list(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.username));
  },

  async remove(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  },

  async setPassword(id: number, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  },

  async setRole(id: number, role: "user" | "admin"): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, id));
  },

  async countAdmins(): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "admin"));
    return row.n;
  },
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/users.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/users.ts tests/users.test.ts
git commit -m "feat: add user storage with bcrypt and first-user-admin"
```

### Task 2.2: Rewrite `server/auth.ts` for username/password + roles

**Files:**
- Modify: `server/auth.ts`

- [ ] **Step 1: Replace `server/auth.ts` with**

```ts
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
export async function handleRegister(req: Request, res: Response) {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

  const userCount = await userStore.count();
  const callerIsAdmin = (req.session as any).role === "admin";
  if (userCount > 0 && !callerIsAdmin) {
    return res.status(403).json({ message: "Registration is closed. Ask an admin to create your account." });
  }

  const existing = await userStore.findByUsername(parsed.data.username);
  if (existing) return res.status(409).json({ message: "Username already taken" });

  const user = await userStore.create({ username: parsed.data.username, password: parsed.data.password });

  // Bootstrap case: first user logs themselves in. Admin-creating-user: do NOT
  // change the admin's session.
  if (userCount === 0) {
    return req.session.regenerate((err) => {
      if (err) return res.status(500).json({ message: "Session error" });
      (req.session as any).userId = user.id;
      (req.session as any).role = user.role;
      req.session.save((e) => e ? res.status(500).json({ message: "Session error" }) : res.json({ ok: true, username: user.username, role: user.role }));
    });
  }
  return res.status(201).json({ id: user.id, username: user.username, role: user.role });
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
    // Tell the client whether registration is still open (no users yet).
    const needsBootstrap = (await userStore.count()) === 0;
    return res.status(401).json({ authenticated: false, needsBootstrap });
  }
  const user = await userStore.findById(s.userId);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ authenticated: false, needsBootstrap: false }); }
  return res.json({ authenticated: true, username: user.username, role: user.role });
}
```

- [ ] **Step 2: Add request type augmentation**

Create `server/types.d.ts`:
```ts
import "express";
declare global {
  namespace Express {
    interface Request { userId?: number; userRole?: string; }
  }
}
export {};
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `server/auth.ts` or `server/types.d.ts` (routes/storage errors are fixed in Phase 3).

- [ ] **Step 4: Commit**

```bash
git add server/auth.ts server/types.d.ts
git commit -m "feat: username/password auth with roles and registration gate"
```

### Task 2.3: Auth route integration tests

**Files:**
- Create: `tests/auth.test.ts`, `tests/helpers/app.ts`

- [ ] **Step 1: Write `tests/helpers/app.ts` (builds an Express app for tests)**

```ts
import express from "express";
import session from "express-session";
import { registerRoutes } from "../../server/routes";
import { createServer } from "http";

export async function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    name: "sid",
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/auth.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { resetDb } from "./helpers/db";
import { makeApp } from "./helpers/app";

let app: any;
beforeEach(async () => { await resetDb(); app = await makeApp(); });

describe("auth", () => {
  it("first register creates an admin and logs in", async () => {
    const res = await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("closes public registration after first user", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const res = await request(app).post("/api/auth/register").send({ username: "bob", password: "secret123" });
    expect(res.status).toBe(403);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const agent = request.agent(app);
    const ok = await agent.post("/api/auth/login").send({ username: "alice", password: "secret123" });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ username: "alice", password: "nope12345" });
    expect(bad.status).toBe(401);
  });

  it("me reports needsBootstrap when no users exist", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.needsBootstrap).toBe(true);
  });

  it("blocks data routes without a session", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const res = await request(app).get("/api/expenses");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/auth.test.ts`
Expected: FAIL (routes not yet wired — register route missing). Some may pass; the register/me ones will fail until Task 3.x mounts routes. (This task's tests fully pass after Phase 3.)

- [ ] **Step 4: Commit (tests-first; will go green in Phase 3)**

```bash
git add tests/auth.test.ts tests/helpers/app.ts
git commit -m "test: auth route integration tests (red until routes wired)"
```

---

## Phase 3 — Per-user data scoping

### Task 3.1: Scope the storage layer by `userId`

**Files:**
- Modify: `server/storage.ts`
- Test: `tests/isolation.test.ts`

- [ ] **Step 1: Write the failing isolation test**

```ts
// tests/isolation.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { userStore } from "../server/users";
import { storage } from "../server/storage";

let alice: number, bob: number;
beforeEach(async () => {
  await resetDb();
  alice = (await userStore.create({ username: "alice", password: "secret123" })).id;
  bob = (await userStore.create({ username: "bob", password: "secret123" })).id;
});

describe("storage isolation", () => {
  it("only returns the owner's expenses", async () => {
    await storage.createExpense(alice, { amount: 100, description: "a", category: "Food", date: "2026-01-01", source: "manual" });
    await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    const aList = await storage.getExpenses(alice);
    expect(aList).toHaveLength(1);
    expect(aList[0].description).toBe("a");
  });

  it("cannot read another user's expense by id", async () => {
    const e = await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    expect(await storage.getExpense(alice, e.id)).toBeUndefined();
  });

  it("cannot update or delete another user's expense", async () => {
    const e = await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    expect(await storage.updateExpense(alice, e.id, { amount: 1 })).toBeUndefined();
    await storage.deleteExpense(alice, e.id);
    expect(await storage.getExpense(bob, e.id)).toBeDefined(); // still there
  });

  it("scopes budgets per user with same month", async () => {
    await storage.setBudget(alice, { month: "2026-01", amount: 1000 });
    await storage.setBudget(bob, { month: "2026-01", amount: 2000 });
    expect((await storage.getBudget(alice, "2026-01"))!.amount).toBe(1000);
    expect((await storage.getBudget(bob, "2026-01"))!.amount).toBe(2000);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/isolation.test.ts`
Expected: FAIL — `createExpense` signature mismatch (arity).

- [ ] **Step 3: Rewrite `server/storage.ts`**

Replace the whole file with the version below. Every method takes `userId` as its first argument and every query filters by it. Gmail methods are removed.

```ts
import { db } from "./db";
import {
  expenses, budgets, investments, subscriptions, income,
  type CreateExpenseRequest, type UpdateExpenseRequest, type ExpenseResponse, type ExpensesListResponse,
  type Budget, type InsertBudget, type Investment, type InsertInvestment,
  type Subscription, type InsertSubscription, type Income, type InsertIncome,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export class DatabaseStorage {
  // ── Expenses ──
  async getExpenses(userId: number): Promise<ExpensesListResponse> {
    return db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.date));
  }
  async getExpense(userId: number, id: number): Promise<ExpenseResponse | undefined> {
    const [row] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
    return row;
  }
  async createExpense(userId: number, data: CreateExpenseRequest): Promise<ExpenseResponse> {
    const [row] = await db.insert(expenses).values({ ...data, userId }).returning();
    return row;
  }
  async updateExpense(userId: number, id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse | undefined> {
    const [row] = await db.update(expenses).set(updates).where(and(eq(expenses.id, id), eq(expenses.userId, userId))).returning();
    return row;
  }
  async deleteExpense(userId: number, id: number): Promise<void> {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
  }

  // ── Budgets ──
  async getBudget(userId: number, month: string): Promise<Budget | undefined> {
    const [row] = await db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month)));
    return row;
  }
  async setBudget(userId: number, b: InsertBudget): Promise<Budget> {
    const existing = await this.getBudget(userId, b.month);
    if (existing) {
      const [row] = await db.update(budgets).set({ amount: b.amount }).where(and(eq(budgets.userId, userId), eq(budgets.month, b.month))).returning();
      return row;
    }
    const [row] = await db.insert(budgets).values({ ...b, userId }).returning();
    return row;
  }

  // ── Investments ──
  async getInvestments(userId: number): Promise<Investment[]> {
    return db.select().from(investments).where(eq(investments.userId, userId)).orderBy(desc(investments.createdAt));
  }
  async createInvestment(userId: number, data: InsertInvestment): Promise<Investment> {
    const [row] = await db.insert(investments).values({ ...data, userId }).returning();
    return row;
  }
  async updateInvestment(userId: number, id: number, data: Partial<InsertInvestment>): Promise<Investment | undefined> {
    const [row] = await db.update(investments).set(data).where(and(eq(investments.id, id), eq(investments.userId, userId))).returning();
    return row;
  }
  async deleteInvestment(userId: number, id: number): Promise<void> {
    await db.delete(investments).where(and(eq(investments.id, id), eq(investments.userId, userId)));
  }

  // ── Subscriptions ──
  async getSubscriptions(userId: number): Promise<Subscription[]> {
    return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt));
  }
  async createSubscription(userId: number, data: InsertSubscription): Promise<Subscription> {
    const [row] = await db.insert(subscriptions).values({ ...data, userId }).returning();
    return row;
  }
  async updateSubscription(userId: number, id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [row] = await db.update(subscriptions).set(data).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId))).returning();
    return row;
  }
  async deleteSubscription(userId: number, id: number): Promise<void> {
    await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
  }

  // ── Income ──
  async getIncome(userId: number): Promise<Income[]> {
    return db.select().from(income).where(eq(income.userId, userId)).orderBy(desc(income.date));
  }
  async createIncome(userId: number, data: InsertIncome): Promise<Income> {
    const [row] = await db.insert(income).values({ ...data, userId }).returning();
    return row;
  }
  async updateIncome(userId: number, id: number, data: Partial<InsertIncome>): Promise<Income | undefined> {
    const [row] = await db.update(income).set(data).where(and(eq(income.id, id), eq(income.userId, userId))).returning();
    return row;
  }
  async deleteIncome(userId: number, id: number): Promise<void> {
    await db.delete(income).where(and(eq(income.id, id), eq(income.userId, userId)));
  }

  // ── Admin stats: per-user transaction counts ──
  async transactionCounts(userId: number): Promise<{ expenses: number; income: number }> {
    const exp = await db.select().from(expenses).where(eq(expenses.userId, userId));
    const inc = await db.select().from(income).where(eq(income.userId, userId));
    return { expenses: exp.length, income: inc.length };
  }
}

export const storage = new DatabaseStorage();
```

- [ ] **Step 4: Run, verify it passes**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/isolation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts tests/isolation.test.ts
git commit -m "feat: scope all storage queries by userId with isolation tests"
```

### Task 3.2: Update routes to pass `req.userId`, mount auth, remove gmail

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Replace `server/routes.ts` with**

```ts
import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  requireAuth, requireAdmin, handleLogin, handleLogout, handleMe, handleRegister, loginRateLimiter,
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
```

> The old seed block (`storage.getExpenses()` with no args) is removed — seeding global demo data no longer makes sense in a multi-user app.

- [ ] **Step 2: Run the auth tests from Task 2.3 — they should now pass**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/auth.test.ts`
Expected: PASS (5 tests). `registerAdminRoutes` exists after Task 4.1; if running this task before 4.1, temporarily stub it — but execute Task 4.1 immediately after, then re-run.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat: scope all data routes by session user; remove gmail routes"
```

---

## Phase 4 — Admin backend

### Task 4.1: Admin route handlers

**Files:**
- Create: `server/admin.ts`
- Test: `tests/admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { resetDb } from "./helpers/db";
import { makeApp } from "./helpers/app";

let app: any;
async function admin() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ username: "admin", password: "secret123" }); // first => admin
  return agent;
}
beforeEach(async () => { await resetDb(); app = await makeApp(); });

describe("admin", () => {
  it("lists users with counts", async () => {
    const agent = await admin();
    await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty("expenseCount");
  });

  it("rejects non-admins", async () => {
    const agent = await admin();
    await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const bob = request.agent(app);
    await bob.post("/api/auth/login").send({ username: "bob", password: "secret123" });
    expect((await bob.get("/api/admin/users")).status).toBe(403);
  });

  it("admin creates and deletes a user", async () => {
    const agent = await admin();
    const created = await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    expect(created.status).toBe(201);
    const del = await agent.delete(`/api/admin/users/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("admin cannot delete self", async () => {
    const agent = await admin();
    const me = await agent.get("/api/auth/me");
    const list = await agent.get("/api/admin/users");
    const selfId = list.body.find((u: any) => u.username === "admin").id;
    expect((await agent.delete(`/api/admin/users/${selfId}`)).status).toBe(400);
    expect(me.body.username).toBe("admin");
  });

  it("cannot demote the last admin", async () => {
    const agent = await admin();
    const list = await agent.get("/api/admin/users");
    const selfId = list.body.find((u: any) => u.username === "admin").id;
    const res = await agent.put(`/api/admin/users/${selfId}/role`).send({ role: "user" });
    expect(res.status).toBe(400);
  });

  it("admin resets a user's password", async () => {
    const agent = await admin();
    const created = await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const reset = await agent.put(`/api/admin/users/${created.body.id}/password`).send({ password: "newpass123" });
    expect(reset.status).toBe(204);
    const bob = request.agent(app);
    expect((await bob.post("/api/auth/login").send({ username: "bob", password: "newpass123" })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/admin.test.ts`
Expected: FAIL — cannot find `server/admin`.

- [ ] **Step 3: Write `server/admin.ts`**

```ts
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

  // Create a user (admin invite).
  app.post("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    const parsed = newUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    if (await userStore.findByUsername(parsed.data.username)) return res.status(409).json({ message: "Username already taken" });
    const u = await userStore.create({ username: parsed.data.username, password: parsed.data.password, role: "user" });
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/admin.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `DATABASE_URL=$TEST_DATABASE_URL npm test`
Expected: PASS — users, auth, isolation, admin suites all green.

- [ ] **Step 6: Commit**

```bash
git add server/admin.ts tests/admin.test.ts
git commit -m "feat: admin routes for user management with safety rails"
```

---

## Phase 5 — Postgres-backed sessions

### Task 5.1: Switch session store to connect-pg-simple

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Replace the session-store block in `server/index.ts`**

Remove the `MemoryStore` import (line 3) and the `const SessionStore = MemoryStore(session);` block. Replace with:

```ts
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
```
and the store config:
```ts
const PgStore = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET env var is not set — refusing to start in production");
  process.exit(1);
}

app.use(
  session({
    store: new PgStore({
      pool,                      // reuse the app's pg pool
      tableName: "user_sessions",
      createTableIfMissing: true, // auto-create the session table
    }),
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
```

- [ ] **Step 2: Confirm build bundles connect-pg-simple**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds (esbuild bundles `connect-pg-simple`; unlike the historical note about `table.sql`, `createTableIfMissing` avoids the file dependency).

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: use postgres-backed sessions via connect-pg-simple"
```

---

## Phase 6 — Client

### Task 6.1: Auth hook returns username + role

**Files:**
- Modify: `client/src/hooks/use-auth.ts`

- [ ] **Step 1: Replace `client/src/hooks/use-auth.ts` with**

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";

const AUTH_KEY = ["/api/auth/me"];

export interface AuthState {
  authenticated: boolean;
  username: string | null;
  role: "user" | "admin" | null;
  needsBootstrap: boolean;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthState>({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { authenticated: true, username: body.username, role: body.role, needsBootstrap: false };
        return { authenticated: false, username: null, role: null, needsBootstrap: !!body.needsBootstrap };
      } catch {
        return { authenticated: false, username: null, role: null, needsBootstrap: false };
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    authenticated: data?.authenticated ?? false,
    username: data?.username ?? null,
    role: data?.role ?? null,
    needsBootstrap: data?.needsBootstrap ?? false,
    isLoading,
  };
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    qc.clear();
    qc.invalidateQueries({ queryKey: AUTH_KEY });
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/use-auth.ts
git commit -m "feat(client): auth hook exposes username and role"
```

### Task 6.2: Username/password Login + Register page

**Files:**
- Modify: `client/src/pages/Login.tsx`
- Create: `client/src/pages/Register.tsx`

- [ ] **Step 1: Replace `client/src/pages/Login.tsx` with a username/password form**

```tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

interface LoginProps {
  onSuccess: () => void;
  bootstrap?: boolean; // first-ever user: register form instead of login
}

export default function Login({ onSuccess, bootstrap = false }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const endpoint = bootstrap ? "/api/auth/register" : "/api/auth/login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: "include",
      });
      if (res.ok) { onSuccess(); return; }
      const data = await res.json().catch(() => ({}));
      setError(res.status === 429 ? "Too many attempts. Try again in 15 minutes." : data.message || "Incorrect username or password");
    } catch {
      setError("Network error. Check your connection.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="absolute top-5 right-5"><ThemeToggle /></div>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center space-y-1">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Finance Tracker</h1>
          <p className="text-[14px] text-muted-foreground">
            {bootstrap ? "Create the first (admin) account" : "Sign in to your account"}
          </p>
        </div>
        <form onSubmit={submit} className="w-full space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={bootstrap ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : bootstrap ? "Create admin account" : "Sign in"}
          </Button>
        </form>
        <p className="text-[12px] text-muted-foreground/50 text-center">Secured with bcrypt · Rate-limited</p>
      </div>
    </div>
  );
}
```

> Registration for non-first users happens inside the admin panel, so a standalone public `/register` route is unnecessary. The `bootstrap` flag reuses this component to create the first admin. (No separate `Register.tsx` is needed — delete this from the file list if created.)

- [ ] **Step 2: Update `AuthGuard` in `client/src/App.tsx`**

Replace the `AuthGuard` function so it passes `bootstrap` and wires role:
```tsx
function AuthGuard() {
  const { authenticated, needsBootstrap, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!authenticated) {
    return <Login bootstrap={needsBootstrap} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); }} />;
  }
  return <Router />;
}
```

- [ ] **Step 3: Verify build/typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (input-otp import removed; `Login` no longer uses OTP).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Login.tsx client/src/App.tsx
git commit -m "feat(client): username/password login with first-admin bootstrap"
```

### Task 6.3: Admin page + nav

**Files:**
- Create: `client/src/pages/Admin.tsx`, `client/src/hooks/use-admin.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write `client/src/hooks/use-admin.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AdminUser {
  id: number; username: string; role: "user" | "admin";
  createdAt: string; lastLoginAt: string | null;
  expenseCount: number; incomeCount: number;
}

const KEY = ["/api/admin/users"];
async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Request failed");
  return res.status === 204 ? null : res.json();
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({ queryKey: KEY, queryFn: () => jsonFetch("/api/admin/users") });
}

export function useAdminMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    createUser: useMutation({ mutationFn: (v: { username: string; password: string }) => jsonFetch("/api/admin/users", { method: "POST", body: JSON.stringify(v) }), onSuccess: invalidate }),
    deleteUser: useMutation({ mutationFn: (id: number) => jsonFetch(`/api/admin/users/${id}`, { method: "DELETE" }), onSuccess: invalidate }),
    resetPassword: useMutation({ mutationFn: (v: { id: number; password: string }) => jsonFetch(`/api/admin/users/${v.id}/password`, { method: "PUT", body: JSON.stringify({ password: v.password }) }), onSuccess: invalidate }),
    setRole: useMutation({ mutationFn: (v: { id: number; role: "user" | "admin" }) => jsonFetch(`/api/admin/users/${v.id}/role`, { method: "PUT", body: JSON.stringify({ role: v.role }) }), onSuccess: invalidate }),
  };
}
```

- [ ] **Step 2: Write `client/src/pages/Admin.tsx`**

```tsx
import { useState } from "react";
import { useAdminUsers, useAdminMutations } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { data: users, isLoading } = useAdminUsers();
  const { createUser, deleteUser, resetPassword, setRole } = useAdminMutations();
  const { toast } = useToast();
  const [nu, setNu] = useState({ username: "", password: "" });

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast({ title: ok })).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">Admin · Users</h1>

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => { e.preventDefault(); run(createUser.mutateAsync(nu), "User created").then(() => setNu({ username: "", password: "" })); }}
      >
        <div className="flex-1"><Input placeholder="username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></div>
        <div className="flex-1"><Input placeholder="password (min 8)" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
        <Button type="submit" disabled={createUser.isPending}>Create user</Button>
      </form>

      {isLoading ? <p>Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Txns</TableHead><TableHead>Last login</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                <TableCell>{u.expenseCount + u.incomeCount}</TableCell>
                <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => run(setRole.mutateAsync({ id: u.id, role: u.role === "admin" ? "user" : "admin" }), "Role updated")}>
                    {u.role === "admin" ? "Demote" : "Promote"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { const p = prompt("New password (min 8 chars)"); if (p) run(resetPassword.mutateAsync({ id: u.id, password: p }), "Password reset"); }}>Reset pw</Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${u.username} and all their data?`)) run(deleteUser.mutateAsync(u.id), "User deleted"); }}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `/admin` route + nav in `client/src/App.tsx`**

Add import: `import Admin from "@/pages/Admin";` and read role in `Router`:
```tsx
function Router() {
  useSubscriptionBilling();
  const { role } = useAuth();
  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/income" component={Income} />
        <Route path="/investments" component={Investments} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/history" component={History} />
        {role === "admin" && <Route path="/admin" component={Admin} />}
        <Route component={NotFound} />
      </Switch>
      <TabBar isAdmin={role === "admin"} />
    </div>
  );
}
```
Update `TabBar` to accept `isAdmin` and conditionally add an Admin tab (use the `Users` icon from lucide-react):
```tsx
function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const [location] = useLocation();
  const logout = useLogout();
  const tabs = [
    { href: "/",              label: "Overview",  icon: LayoutDashboard },
    { href: "/income",        label: "Income",    icon: Wallet },
    { href: "/investments",   label: "Invest",    icon: TrendingUp },
    { href: "/subscriptions", label: "Subs",      icon: RefreshCw },
    { href: "/history",       label: "History",   icon: HistoryIcon },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Users }] : []),
  ];
  /* …rest of existing TabBar JSX unchanged, plus the logout button… */
}
```
Add `Users` to the lucide-react import on line 16.

- [ ] **Step 4: Verify typecheck/build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Admin.tsx client/src/hooks/use-admin.ts client/src/App.tsx
git commit -m "feat(client): admin panel for user management"
```

---

## Phase 7 — Final verification & deploy prep

### Task 7.1: Full verification

- [ ] **Step 1: Typecheck, build, full test suite**

Run: `npx tsc --noEmit && npm run build && DATABASE_URL=$TEST_DATABASE_URL npm test`
Expected: all green.

- [ ] **Step 2: Manual smoke test against a dev DB**

Set `DATABASE_URL` to an empty dev DB and `npm run db:push`, then `npm run dev`. Verify:
- Visiting the app with an empty DB shows the "Create the first (admin) account" form.
- After creating it, you land in the app as admin and see the Admin tab.
- Create a second user in Admin; log out; log in as that user; confirm they see no data from the admin and cannot reach `/admin` (route not registered for them).
- Add an expense as the normal user; confirm the admin does not see it.

- [ ] **Step 3: Update docs**

Update `README.md` and `PRODUCT.md` to describe the multi-user model and remove Gmail references. Replace `PRODUCT.md` "Single user" line with the multi-user description.

- [ ] **Step 4: Commit**

```bash
git add README.md PRODUCT.md
git commit -m "docs: update product docs for multi-user model"
```

### Task 7.2: Deploy prep (requires user inputs)

- [ ] **Step 1: Confirm `.env` is gitignored and `.env.example` exists**

Create `.env.example`:
```
DATABASE_URL=postgres://...        # new Neon connection string
SESSION_SECRET=change-me-to-a-long-random-string
NODE_ENV=development
PORT=5000
```
Confirm `.gitignore` contains `.env`.

- [ ] **Step 2: Point at the new Neon DB and push schema**

> **Needs user input:** the new Neon `DATABASE_URL`. Put it in `.env` (never commit). Then:
Run: `npm run db:push`
Expected: tables created on the fresh Neon DB.

- [ ] **Step 3: Push to the new repo**

> **Needs user input:** the new GitHub repo URL.
```bash
git remote remove origin 2>/dev/null || true
git remote add origin <NEW_REPO_URL>
git push -u origin main
```

- [ ] **Step 4: Done** — first admin is created by visiting `/register`-equivalent (the bootstrap login form) on the deployed app while the users table is empty.

---

## Self-Review Notes

- **Spec coverage:** users table + per-user scoping (Tasks 1.1, 3.1, 3.2); username/password + roles (2.1, 2.2); first-user-admin + admin-invite (2.1, 2.2); admin list/create/delete/reset/promote with last-admin & self-delete guards (4.1); Postgres sessions (5.1); client login/admin/user-menu (6.x); Gmail + widget removal (0.1, 1.1, 3.2); testing isolation + auth + admin (2.1, 2.3, 3.1, 4.1). All spec sections map to a task.
- **Type consistency:** `userStore` method names used identically across users.ts, auth.ts, admin.ts. `storage` methods all take `userId` first arg, matched in routes.ts and isolation tests. `AuthState`/`AdminUser` shapes match server `handleMe`/admin list responses.
- **Known ordering note:** Task 3.2 imports `registerAdminRoutes` (Task 4.1). Execute 3.2 and 4.1 together (or stub then fill) — flagged in 3.2 Step 2.
