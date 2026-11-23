/**
 * Apply all migrations (generated + drizzle/custom) to the configured
 * database: DATABASE_URL when set, else the local PGlite in ./.data/pglite.
 */
import { openConfiguredDb } from "../src/client";

async function main() {
  const handle = await openConfiguredDb({ migrate: true });
  await handle.close();
  console.log(`Migrations applied (${process.env.DATABASE_URL ? "Postgres" : "PGlite at .data/pglite"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
