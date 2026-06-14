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

// SSL is required for hosted Postgres (Neon) — rejectUnauthorized: true prevents
// MITM. It's disabled only for a true local Postgres host. We parse the hostname
// rather than substring-matching the URL, so a remote host that merely contains
// "localhost" in a query param or password cannot trick us into dropping TLS.
function resolvePgSsl(connectionString: string): false | { rejectUnauthorized: true } {
  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  } catch {
    // Unparseable URL — fail safe to TLS on.
  }
  return { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolvePgSsl(process.env.DATABASE_URL!),
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