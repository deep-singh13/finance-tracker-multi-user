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
