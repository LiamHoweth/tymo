/**
 * Test database helpers (Vitest + in-memory PGlite).
 *
 * Test files that import engine code must mock `server-only` first:
 *   vi.mock("server-only", () => ({}));
 *
 * Typical use:
 *   let h: DbHandle;
 *   beforeAll(async () => { h = await setupTestDb(); });
 *   beforeEach(async () => { seeded = await resetAndSeed(h, { now }); });
 *   afterAll(async () => { await teardownTestDb(h); });
 */
import { createTestDbHandle, truncateAll, type DbHandle } from "@tymo/db/client";
import { setDbForTests } from "@tymo/db";
import { seed, type SeedOptions, type SeedResult } from "@tymo/company/seed";
import { resetFakePayments } from "@tymo/platform/payments/fake";

export type { DbHandle, SeedResult };

/** Fresh in-memory database with migrations applied; engine code (getDb/withTenant) uses it. */
export async function setupTestDb(): Promise<DbHandle> {
  const handle = await createTestDbHandle();
  setDbForTests(handle.db);
  return handle;
}

/** Wipe every table and the fake payment state, then seed (no sample bookings unless asked). */
export async function resetAndSeed(handle: DbHandle, opts: SeedOptions = {}): Promise<SeedResult> {
  await truncateAll(handle);
  resetFakePayments();
  return seed(handle.db, { sampleBookings: false, ...opts });
}

export async function teardownTestDb(handle: DbHandle | undefined): Promise<void> {
  setDbForTests(null);
  if (handle) await handle.close();
}
