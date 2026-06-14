import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, type User } from "@shared/schema";
import { eq, sql, asc } from "drizzle-orm";

const SALT_ROUNDS = 10;

// Precomputed hash of a throwaway value. Compared against when a username is not
// found so login takes the same time whether or not the user exists — closing a
// timing oracle that would otherwise reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("invalid-password-placeholder", SALT_ROUNDS);

// Role is never accepted from the caller (no mass-assignment). The first user
// ever created becomes admin; everyone else is a normal user. Promotion to admin
// happens only via setRole, which is reachable only from admin-only routes.
export interface CreateUserInput { username: string; password: string; }

export const userStore = {
  async count(): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row.n;
  },

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    // Serialize concurrent creates with a transaction-scoped advisory lock so the
    // "first user is admin" decision and the insert are atomic — two simultaneous
    // registrations can't both read count()===0 and both become admin (TOCTOU).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(4242424242)`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
      const role = n === 0 ? "admin" : "user";
      const [user] = await tx.insert(users)
        .values({ username: input.username, passwordHash, role })
        .returning();
      return user;
    });
  },

  // Atomically create the very first user as admin. The empty-table check and the
  // insert run inside one advisory-locked transaction, so the registration-closed
  // gate cannot be raced: if any user already exists, this inserts nothing and
  // returns null. Shares the lock id with create() so the two are mutually
  // serialized.
  async createInitialAdmin(input: CreateUserInput): Promise<User | null> {
    // Cheap fail-closed reject: once any user exists, registration is closed, so
    // return before spending CPU on bcrypt. The in-transaction recheck under the
    // advisory lock below still guarantees atomicity against the bootstrap race.
    if ((await this.count()) > 0) return null;
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(4242424242)`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
      if (n !== 0) return null; // registration already closed — do not insert
      const [user] = await tx.insert(users)
        .values({ username: input.username, passwordHash, role: "admin" })
        .returning();
      return user;
    });
  },

  async findByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  async findById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async verify(username: string, password: string): Promise<User | null> {
    const user = await this.findByUsername(username);
    if (!user) { await bcrypt.compare(password, DUMMY_HASH); return null; }
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
