/**
 * Database connections and migrations, without the `server-only` marker so
 * scripts (tsx) and tests can use them. App code imports `@tymo/db`.
 */
import { existsSync } from "node:fs";
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
  /** PGlite only: the underlying PGlite instance (the dev socket server shares it). */
  raw?: unknown;
}

/**
 * The monorepo root: the nearest folder (from the working directory up)
 * that holds packages/db/drizzle. Apps run from apps/<name>, scripts and
 * tests from the root; both resolve to the same place.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "packages", "db", "drizzle"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

/** Directory holding drizzle-kit output and hand-written SQL (`drizzle/custom/`). */
export function defaultMigrationsDir(): string {
  return path.join(repoRoot(), "packages", "db", "drizzle");
}

/** Local embedded database used by scripts and the dev database server. */
export function defaultDataDir(): string {
  return path.join(repoRoot(), ".data", "pglite");
}

/** Port of the local dev database server (npm run dev:db). */
export const DEV_DB_PORT = Number(process.env.TYMO_DEV_DB_PORT || 5433);

/** Connection string for the local dev database server. */
export function devDatabaseUrl(): string {
  return `postgres://postgres@127.0.0.1:${DEV_DB_PORT}/postgres`;
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
    raw: client,
  };
}

/** Production Postgres via node-postgres. Sessions run in UTC. */
export async function openPostgres(connectionString: string): Promise<DbHandle> {
  const pg = (await import("pg")).default;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString, options: "-c timezone=UTC", connectionTimeoutMillis: 5_000 });
  // An idle client can lose its connection between requests. The pool
  // discards that client and opens a fresh connection when needed.
  pool.on("error", () => console.warn("[database] Idle PostgreSQL connection closed unexpectedly."));
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
export async function openConfiguredDb(
  opts: { url?: string; dataDir?: string; migrate?: boolean } = {},
): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    const handle = await openPostgres(url);
    if (opts.migrate) await runMigrations(handle);
    return handle;
  }
  const dataDir = opts.dataDir ?? defaultDataDir();
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
