import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Debug log (will show in Render logs)
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing!");
  process.exit(1); // safer exit than throwing immediately
}

// Neon uses a CA-signed TLS cert; rejectUnauthorized: true prevents MITM attacks.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || "").includes("localhost") || (process.env.DATABASE_URL || "").includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: true },
});

// Optional: log connection errors clearly
pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
  process.exit(1);
});

// Test connection once at startup (helps debugging on Render)
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to PostgreSQL successfully");
    client.release();
  } catch (err) {
    console.error("❌ Failed to connect to PostgreSQL:", err);
    process.exit(1);
  }
})();

// Initialize Drizzle
export const db = drizzle(pool, { schema });