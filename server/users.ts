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

  async verify(username: string, password: string): Promise<User | null> {
    const user = await this.findByUsername(username);
    if (!user) { await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinv"); return null; }
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
