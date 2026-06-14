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
