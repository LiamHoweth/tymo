/**
 * Local dev database: one embedded PGlite (./.data/pglite) served over the
 * Postgres wire protocol on 127.0.0.1:5433, so every app (company web,
 * company services, Tymo services) shares the same data. On start it applies
 * migrations and seeds the demo tenants into an empty database.
 *
 * The socket server multiplexes connections but queues other clients while
 * one is inside a transaction, so withTenant()'s SET LOCAL settings never
 * leak between apps.
 */
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { DEV_DB_PORT, defaultDataDir, devDatabaseUrl, openPglite, runMigrations } from "@tymo/db/client";
import { seed } from "../src/seed";

async function main() {
  const dataDir = defaultDataDir();
  const handle = await openPglite(dataDir);
  await runMigrations(handle);

  const result = (await handle.db.execute(sql`select count(*)::int as n from tenants`)) as unknown as {
    rows: { n: number }[];
  };
  if (Number(result.rows[0]?.n ?? 0) === 0) {
    await seed(handle.db);
    console.log("[db] Seeded the demo tenants (Redbud Soccer Complex, Cedar Park Courts).");
  }

  const server = new PGLiteSocketServer({
    db: handle.raw as PGlite,
    host: "127.0.0.1",
    port: DEV_DB_PORT,
    maxConnections: 20,
  });
  try {
    await server.start();
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(
      code === "EADDRINUSE"
        ? `[db] Port ${DEV_DB_PORT} is busy. Another dev database is probably running; stop it or set TYMO_DEV_DB_PORT.`
        : err,
    );
    await handle.close();
    process.exit(1);
  }
  console.log(`[db] Dev database ready at ${devDatabaseUrl()} (data in ${dataDir}).`);

  const stop = async () => {
    await server.stop().catch(() => {});
    await handle.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
