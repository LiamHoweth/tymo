import { getDb, schema } from "@tymo/db";

const headers = { "Cache-Control": "no-store" };

/** Readiness probe for the database connection and the migrated tenant schema. */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(0);
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
