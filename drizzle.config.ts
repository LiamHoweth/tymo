import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  // Hand-written SQL (exclusion constraint, RLS, roles) lives in
  // drizzle/*_custom_*.sql and is applied by scripts/migrate.ts after
  // the generated migrations.
});
