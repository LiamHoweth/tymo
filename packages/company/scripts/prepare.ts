/**
 * Deploy step: apply migrations, then seed the demo tenants only when the
 * database has no tenants yet and TYMO_SEED_DEMO=1. Safe to run on every
 * deploy (Railway preDeployCommand).
 */
import { sql } from "drizzle-orm";
import { openConfiguredDb } from "@tymo/db/client";
import { seed } from "../src/seed";

async function main() {
  const handle = await openConfiguredDb({ migrate: true });
  try {
    const result = (await handle.db.execute(sql`select count(*)::int as n from tenants`)) as unknown as {
      rows: { n: number }[];
    };
    const tenantCount = Number(result.rows[0]?.n ?? 0);
    if (tenantCount === 0 && process.env.TYMO_SEED_DEMO === "1") {
      await seed(handle.db);
      console.log("Migrations applied; seeded the demo tenants.");
    } else {
      console.log(`Migrations applied; ${tenantCount} tenant(s) present, seed skipped.`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
