/**
 * Seed the demo tenants (Redbud Soccer Complex, Cedar Park Courts) into the
 * configured database. Safe to re-run: both tenants are replaced.
 */
import { openConfiguredDb } from "../src/server/db/client";
import { seed } from "../src/server/db/seed";

async function main() {
  const handle = await openConfiguredDb({ migrate: true });
  try {
    const result = await seed(handle.db);
    const r = result.redbud;
    console.log(`Seeded ${Object.keys(r.resources).length} spaces for Redbud Soccer Complex (/book/redbud).`);
    console.log("Staff sign-in emails: owner@redbud.example (owner), staff@redbud.example (staff).");
    console.log(`Seeded Cedar Park Courts (/book/cedar), ${Object.keys(result.cedar.resources).length} courts.`);
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
