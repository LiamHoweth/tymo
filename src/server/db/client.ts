/**
 * Database connections and migrations, without the `server-only` marker so
 * scripts (tsx) and tests can use them. App code imports `@/server/db`.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export { schema };

/** A Drizzle database or transaction over the Tymo schema (PGlite or node-postgres). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Db;

export interface DbHandle {
  db: Db;
  kind: "pglite" | "pg";
  /** Run one or more SQL statements with no parameters. */
  exec(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

/** Directory holding drizzle-kit output (`drizzle/`) and hand-written SQL (`drizzle/custom/`). */
export function defaultMigrationsDir(): string {
  return path.join(process.cwd(), "drizzle");
}

/** Embedded Postgres. `dataDir` undefined = in-memory (tests). */
export async function openPglite(dataDir?: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  if (dataDir) await mkdir(path.dirname(dataDir), { recursive: true });
  const client = new PGlite({ dataDir, extensions: { btree_gist } });
  await client.waitReady;
  await client.exec("SET TIME ZONE 'UTC'");
  const db = drizzle({ client, schema }) as unknown as Db;
  return {
    db,
    kind: "pglite",
    exec: async (sqlText) => {
      await client.exec(sqlText);
    },
    close: () => client.close(),
  };
}

/** Production Postgres via node-postgres. Sessions run in UTC. */
export async function openPostgres(connectionString: string): Promise<DbHandle> {
  const pg = (await import("pg")).default;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString, options: "-c timezone=UTC" });
  const db = drizzle({ client: pool, schema }) as unknown as Db;
  return {
    db,
    kind: "pg",
    exec: async (sqlText) => {
      await pool.query(sqlText);
    },
    close: () => pool.end(),
  };
}

/**
 * Apply drizzle-kit migrations (tracked in drizzle.__drizzle_migrations),
 * then every file in drizzle/custom/ in name order. Custom SQL is written
 * to be idempotent and runs on every call, so it also covers tables added
 * by later generated migrations (RLS, grants).
 */
export async function runMigrations(handle: DbHandle, migrationsDir = defaultMigrationsDir()): Promise<void> {
  if (handle.kind === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(handle.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: migrationsDir });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(handle.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: migrationsDir });
  }
  const customDir = path.join(migrationsDir, "custom");
  let files: string[] = [];
  try {
    files = (await readdir(customDir)).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    files = [];
  }
  for (const file of files) {
    const text = await readFile(path.join(customDir, file), "utf8");
    await handle.exec(text);
  }
}

/** Open the configured database: Postgres when DATABASE_URL is set, else PGlite at `dataDir`. */
export async function openConfiguredDb(opts: { dataDir?: string; migrate?: boolean } = {}): Promise<DbHandle> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const handle = await openPostgres(url);
    if (opts.migrate) await runMigrations(handle);
    return handle;
  }
  const dataDir = opts.dataDir ?? path.join(process.cwd(), ".data", "pglite");
  const handle = await openPglite(dataDir);
  if (opts.migrate ?? true) await runMigrations(handle);
  return handle;
}

/** Fresh in-memory PGlite with all migrations applied (tests). */
export async function createTestDbHandle(): Promise<DbHandle> {
  const handle = await openPglite();
  await runMigrations(handle);
  return handle;
}

/** Every table in the public schema, for wiping test data between cases. */
export async function truncateAll(handle: DbHandle): Promise<void> {
  const tables = [
    "email_outbox",
    "audit_log",
    "unit_occupancy",
    "blocks",
    "bookings",
    "customers",
    "rate_bands",
    "operating_hours",
    "resource_units",
    "units",
    "resources",
    "magic_links",
    "staff_sessions",
    "users",
    "stripe_events",
    "tenants",
  ];
  await handle.exec(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}
