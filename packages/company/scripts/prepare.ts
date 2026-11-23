/**
 * Deploy step: apply migrations, then seed the demo tenants only when the
 * database has no tenants yet and TYMO_SEED_DEMO=1. Tymo services runs this
 * before accepting requests.
 */
import { count, sql } from "drizzle-orm";
import { openConfiguredDb, runMigrations, type Db, type DbHandle } from "@tymo/db/client";
import { tenants } from "@tymo/db/schema";
import { seed } from "../src/seed";

async function seedWhenEmpty(tx: Db): Promise<string> {
  const [{ value: tenantCount }] = await tx.select({ value: count() }).from(tenants);
  if (tenantCount === 0 && process.env.TYMO_SEED_DEMO === "1") {
    await seed(tx);
    return "Migrations applied; seeded the demo tenants.";
  }
  return `Migrations applied; ${tenantCount} tenant(s) present, seed skipped.`;
}

async function prepare(handle: DbHandle): Promise<string> {
  if (handle.kind === "pg") {
    return handle.db.transaction(async (tx) => {
      // During overlapping launches, only one process may migrate and seed.
      // The migrator uses a separate connection in this process's pool.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tymo:prepare'))`);
      await runMigrations(handle);
      return seedWhenEmpty(tx);
    });
  }
  await runMigrations(handle);
  return handle.db.transaction(seedWhenEmpty);
}

async function main() {
  const handle = await openConfiguredDb({ migrate: false });
  try {
    console.log(await prepare(handle));
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
