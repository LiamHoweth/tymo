/**
 * Local reset: delete ./.data/pglite, apply migrations, seed the demo
 * tenants. With DATABASE_URL set nothing is deleted: migrations run and the
 * demo tenants are replaced.
 */
import { rm } from "node:fs/promises";
import { defaultDataDir, openConfiguredDb } from "@tymo/db/client";
import { seed } from "../src/seed";
import { assertDevDbStopped } from "./dev-db-guard";

async function main() {
  await assertDevDbStopped();
  if (!process.env.DATABASE_URL) {
    const dir = defaultDataDir();
    await rm(dir, { recursive: true, force: true });
    console.log("Deleted .data/pglite");
  } else {
    console.log("DATABASE_URL is set: keeping the database, replacing the demo tenants.");
  }
  const handle = await openConfiguredDb({ migrate: true });
  try {
    console.log("Migrations applied.");
    const result = await seed(handle.db);
    console.log(
      `Seeded Redbud Soccer Complex (${Object.keys(result.redbud.resources).length} spaces) and Cedar Park Courts.`,
    );
    console.log("Customer flow: /book/redbud   Staff: owner@redbud.example, staff@redbud.example");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
