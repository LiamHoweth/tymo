import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  // Hand-written SQL (exclusion constraint, RLS, roles) lives in
  // drizzle/custom/*.sql and is applied by runMigrations()
  // (src/server/db/client.ts, used by scripts/migrate.ts) after the
  // generated migrations, on every run. Keep it idempotent.
});
