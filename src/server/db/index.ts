import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { notImplemented } from "@/server/not-implemented";

export { schema };

/** A Drizzle database or transaction over the Tymo schema (PGlite or node-postgres). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Db;

/**
 * Shared database handle. With DATABASE_URL set: node-postgres pool.
 * Without it: an embedded PGlite database in ./.data/pglite (dev) with
 * migrations applied on first use. Tests use createTestDb() instead.
 */
export async function getDb(): Promise<Db> {
  return notImplemented("getDb");
}

/**
 * Run fn in a transaction scoped to one tenant: SET LOCAL ROLE tymo_app and
 * set_config('app.tenant_id', tenantId, true), so row-level security
 * applies even if a query forgets a tenant filter.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return notImplemented("withTenant", tenantId, fn);
}

/**
 * Run fn in a transaction WITHOUT tenant scoping. Only for lookups that
 * happen before a tenant is known: tenant by slug, staff login by email,
 * Stripe webhook account lookup, cron iteration over tenants.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return notImplemented("withSystem", fn);
}
