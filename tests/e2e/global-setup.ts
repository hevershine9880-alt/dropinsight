import { execSync } from "node:child_process";

/**
 * Reseeds the database before the suite runs.
 *
 * These tests deliberately change data — they answer supplier claims, enter
 * buying prices, add expenses. Without a reset, run two starts from whatever
 * run one left behind and the assertions drift. Starting from a known state is
 * what makes them mean anything.
 *
 * Set E2E_SKIP_SEED=1 to run against a database you have prepared yourself.
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED === "1") {
    console.log("[e2e] E2E_SKIP_SEED=1 — using the existing database.");
    return;
  }

  console.log("[e2e] Reseeding the database…");
  execSync("npm run db:seed", { stdio: "inherit" });
}
