// Baseline script: marks all existing migrations as applied
// so that prisma migrate deploy only runs new ones.
// This is needed because the DB was initially set up with `prisma db push`.

import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

const migrationsDir = join(process.cwd(), "prisma", "migrations");

// The last migration is the NEW one that actually needs to run
const NEW_MIGRATION = "20260223000000_add_chapter_translated_title";

const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== NEW_MIGRATION)
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

console.log("Baseline complete. New migrations will run via migrate deploy.");
