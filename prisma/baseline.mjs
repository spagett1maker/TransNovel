// Baseline script: marks all migrations as applied.
// The DB was set up with `prisma db push`, so the schema is correct
// but there's no _prisma_migrations table to track history.
// This script creates the tracking table and marks everything as applied.
// It's idempotent — safe to run on every build.

import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

const migrationsDir = join(process.cwd(), "prisma", "migrations");

const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const migration of dirs) {
  console.log(`Marking as applied: ${migration}`);
  try {
    execSync(`npx prisma migrate resolve --applied ${migration}`, {
      stdio: "inherit",
    });
  } catch {
    console.log(`  (already resolved or skipped)`);
  }
}

console.log("Baseline complete.");
