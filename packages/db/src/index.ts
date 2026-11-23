import "server-only";
import { sql } from "drizzle-orm";
import { createTestDbHandle, devDatabaseUrl, openConfiguredDb, type Db, type DbHandle, type Tx } from "./client";
import * as schema from "./schema";

export { schema };
export type { Db, Tx };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DbGlobal {
  __tymoDb?: Promise<DbHandle>;
  __tymoTestDb?: Db | null;
}
const g = globalThis as unknown as DbGlobal;

/**
 * Shared database handle. With DATABASE_URL set: node-postgres pool.
 * Without it: an embedded PGlite database in ./.data/pglite (dev) with
 * migrations applied on first use. Tests use createTestDb() instead.
 */
export async function getDb(): Promise<Db> {
  if (g.__tymoTestDb) return g.__tymoTestDb;
  if (!g.__tymoDb) {
    // Production: DATABASE_URL. Development: the shared dev database server
    // (npm run dev starts it), so every app sees the same data.
    const url = process.env.DATABASE_URL || (process.env.NODE_ENV === "production" ? "" : devDatabaseUrl());
    g.__tymoDb = openConfiguredDb({ url: url || undefined, migrate: !url }).catch((err) => {
      g.__tymoDb = undefined;
      throw err;
    });
  }
  return (await g.__tymoDb).db;
}

/**
 * Run fn in a transaction scoped to one tenant: SET LOCAL ROLE tymo_app and
 * set_config('app.tenant_id', tenantId, true), so row-level security
 * applies even if a query forgets a tenant filter.
 *
 * Never call withTenant/withSystem from inside another transaction: PGlite
 * has one connection, so a nested transaction waits forever.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error("withTenant: invalid tenant id");
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role tymo_app`);
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Tx);
  });
}

/**
 * Run fn in a transaction WITHOUT tenant scoping. Only for lookups that
 * happen before a tenant is known: tenant by slug, staff login by email,
 * Stripe webhook account lookup, cron iteration over tenants.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => fn(tx as unknown as Tx));
}

/** Tests: a fresh in-memory PGlite database with every migration applied. */
export async function createTestDb(): Promise<Db> {
  return (await createTestDbHandle()).db;
}

/** Tests: make getDb()/withTenant()/withSystem() use this database (null restores the default). */
export function setDbForTests(db: Db | null): void {
  g.__tymoTestDb = db;
}
