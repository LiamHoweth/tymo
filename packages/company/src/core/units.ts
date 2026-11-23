import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@tymo/db/client";
import { resources, resourceUnits, units } from "@tymo/db/schema";

export type ResourceRow = typeof resources.$inferSelect;

export interface UnitMap {
  resources: ResourceRow[];
  byId: Map<string, ResourceRow>;
  /** resource id -> unit ids it occupies */
  unitsOf: Map<string, string[]>;
  unitCode: Map<string, string>;
  allUnitIds: string[];
  childrenOf: Map<string, ResourceRow[]>;
}

/** Every resource and unit of a tenant (a few dozen rows), sorted for display. */
export async function loadUnitMap(tx: Tx, tenantId: string): Promise<UnitMap> {
  const [resRows, unitRows, links] = await Promise.all([
    tx.select().from(resources).where(eq(resources.tenantId, tenantId)).orderBy(asc(resources.sortOrder), asc(resources.code)),
    tx.select().from(units).where(eq(units.tenantId, tenantId)).orderBy(asc(units.code)),
    tx.select().from(resourceUnits).where(eq(resourceUnits.tenantId, tenantId)),
  ]);
  const unitCode = new Map(unitRows.map((u) => [u.id, u.code]));
  const unitsOf = new Map<string, string[]>();
  for (const link of links) {
    const list = unitsOf.get(link.resourceId) ?? [];
    list.push(link.unitId);
    unitsOf.set(link.resourceId, list);
  }
  for (const list of unitsOf.values()) list.sort((a, b) => (unitCode.get(a) ?? "").localeCompare(unitCode.get(b) ?? ""));
  const childrenOf = new Map<string, ResourceRow[]>();
  for (const r of resRows) {
    if (!r.parentId) continue;
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r);
    childrenOf.set(r.parentId, list);
  }
  return {
    resources: resRows,
    byId: new Map(resRows.map((r) => [r.id, r])),
    unitsOf,
    unitCode,
    allUnitIds: unitRows.map((u) => u.id),
    childrenOf,
  };
}

/** Units a block covers: its resource's units, or every unit (whole venue). */
export function blockUnitIds(map: UnitMap, resourceId: string | null): string[] {
  if (!resourceId) return map.allUnitIds;
  return map.unitsOf.get(resourceId) ?? [];
}

/** "N1A · half of N1" for parts, the code otherwise. */
export function staffResourceLabel(map: UnitMap, resourceId: string): string {
  const r = map.byId.get(resourceId);
  if (!r) return "";
  if (!r.parentId) return r.code;
  const parent = map.byId.get(r.parentId);
  if (!parent) return r.code;
  const n = map.childrenOf.get(parent.id)?.length ?? 0;
  const part = n === 2 ? "half" : n === 3 ? "third" : n === 4 ? "quarter" : "part";
  return `${r.code} · ${part} of ${parent.code}`;
}

/** Resource by id within a tenant (active or not). */
export async function getResource(tx: Tx, tenantId: string, resourceId: string): Promise<ResourceRow | null> {
  const [r] = await tx
    .select()
    .from(resources)
    .where(and(eq(resources.tenantId, tenantId), eq(resources.id, resourceId)))
    .limit(1);
  return r ?? null;
}
