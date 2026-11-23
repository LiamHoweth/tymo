import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { blocks, bookings, unitOccupancy } from "@/server/db/schema";
import { writeAudit } from "./audit";
import { addDays, atLocalLenient, dateRange, localDate, weekdayOf } from "./time";
import { isExclusionViolation, overlaps, parseRange, rangeLiteral, rowsOf, subtractIntervals, toDate, tsrange } from "./util";

export type BlockRow = typeof blocks.$inferSelect;

export type BlockShape = Pick<
  BlockRow,
  "kind" | "startsAt" | "endsAt" | "weekdays" | "startLocal" | "endLocal" | "startDate" | "endDate" | "skipDates"
>;

export interface Occurrence {
  /** Local date for weekly occurrences; null for one-time blocks and closures. */
  date: string | null;
  start: Date;
  end: Date;
}

/**
 * Occurrences of a block, optionally only those overlapping [from, to).
 * Weekly rules expand per local date in the venue zone, so a Monday
 * 15:00 block stays 15:00 local across DST changes.
 */
export function blockOccurrences(block: BlockShape, zone: string, range?: { from: Date; to: Date }): Occurrence[] {
  if (block.kind === "weekly") {
    if (!block.startDate || !block.endDate || !block.startLocal || !block.endLocal || !block.weekdays?.length) return [];
    let from = block.startDate;
    let to = block.endDate;
    if (range) {
      const rf = addDays(localDate(range.from, zone), -1);
      const rt = addDays(localDate(range.to, zone), 1);
      if (rf > from) from = rf;
      if (rt < to) to = rt;
    }
    if (from > to) return [];
    const skip = new Set(block.skipDates ?? []);
    const days = new Set(block.weekdays);
    const out: Occurrence[] = [];
    for (const d of dateRange(from, to)) {
      if (!days.has(weekdayOf(d)) || skip.has(d)) continue;
      const start = atLocalLenient(d, block.startLocal, zone);
      const end = atLocalLenient(d, block.endLocal, zone);
      if (end <= start) continue;
      if (range && !overlaps(start, end, range.from, range.to)) continue;
      out.push({ date: d, start, end });
    }
    return out;
  }
  if (!block.startsAt || !block.endsAt || block.endsAt <= block.startsAt) return [];
  if (range && !overlaps(block.startsAt, block.endsAt, range.from, range.to)) return [];
  return [{ date: null, start: block.startsAt, end: block.endsAt }];
}

function unitList(unitIds: string[]) {
  return sql.join(
    unitIds.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
}

export interface MaterializeResult {
  /** Occurrences that got at least one new occupancy row. */
  inserted: number;
  /** Weekly dates that could not be materialized because a booking is in the way ('skip' mode). */
  skippedDates: string[];
}

/**
 * Write occupancy rows for a block's occurrences (in [from, to) when given).
 * Time already covered by another block's rows is left out (blocks may
 * overlap each other; the exclusion constraint may not), and re-running is
 * a no-op. mode 'throw': a booking or hold in the way raises 23P01.
 * mode 'skip': that occurrence is skipped and reported.
 */
export async function materializeBlock(
  tx: Tx,
  args: {
    tenantId: string;
    block: BlockShape & { id: string };
    zone: string;
    unitIds: string[];
    from?: Date;
    to?: Date;
    mode: "throw" | "skip";
  },
): Promise<MaterializeResult> {
  const { tenantId, block, zone, unitIds } = args;
  const range = args.from && args.to ? { from: args.from, to: args.to } : undefined;
  // Occurrences are clipped to the range (past time is never written; the
  // next sweep fills in what lies past the horizon).
  const occs = blockOccurrences(block, zone, range)
    .map((o) =>
      range
        ? { ...o, start: o.start < range.from ? range.from : o.start, end: o.end > range.to ? range.to : o.end }
        : o,
    )
    .filter((o) => o.end > o.start);
  if (!occs.length || !unitIds.length) return { inserted: 0, skippedDates: [] };
  const minStart = new Date(Math.min(...occs.map((o) => o.start.getTime())));
  const maxEnd = new Date(Math.max(...occs.map((o) => o.end.getTime())));

  const existing = rowsOf<{ unit_id: string; s: unknown; e: unknown }>(
    await tx.execute(sql`
      select unit_id, lower(during) as s, upper(during) as e
      from unit_occupancy
      where tenant_id = ${tenantId} and kind = 'block'
        and unit_id in (${unitList(unitIds)})
        and during && ${tsrange(minStart, maxEnd)}`),
  );
  const covered = new Map<string, { start: Date; end: Date }[]>();
  for (const row of existing) {
    const list = covered.get(row.unit_id) ?? [];
    list.push({ start: toDate(row.s), end: toDate(row.e) });
    covered.set(row.unit_id, list);
  }

  const result: MaterializeResult = { inserted: 0, skippedDates: [] };
  const allRows: (typeof unitOccupancy.$inferInsert)[] = [];
  for (const occ of occs) {
    const rows: (typeof unitOccupancy.$inferInsert)[] = [];
    for (const unitId of unitIds) {
      for (const piece of subtractIntervals(occ.start, occ.end, covered.get(unitId) ?? [])) {
        rows.push({
          tenantId,
          unitId,
          during: rangeLiteral(piece.start, piece.end),
          kind: "block",
          blockId: block.id,
          occurrenceDate: occ.date,
        });
      }
    }
    if (!rows.length) continue;
    if (args.mode === "skip") {
      try {
        await tx.transaction(async (sp) => {
          await sp.insert(unitOccupancy).values(rows);
        });
      } catch (err) {
        if (!isExclusionViolation(err)) throw err;
        if (occ.date) result.skippedDates.push(occ.date);
        continue;
      }
    } else {
      allRows.push(...rows);
    }
    for (const r of rows) {
      const list = covered.get(r.unitId) ?? [];
      list.push(parseRange(r.during));
      covered.set(r.unitId, list);
    }
    result.inserted++;
  }
  for (let i = 0; i < allRows.length; i += 500) {
    await tx.insert(unitOccupancy).values(allRows.slice(i, i + 500));
  }
  return result;
}

/**
 * Holds yield to staff: delete checkout holds overlapping any occurrence on
 * these units, mark those checkouts abandoned, and return payments to cancel
 * after commit.
 */
export async function releaseHoldsUnderBlock(
  tx: Tx,
  args: { tenantId: string; unitIds: string[]; occurrences: Occurrence[]; actorId: string | null; now: Date },
): Promise<{ bookingId: string; paymentIntentId: string | null }[]> {
  const { tenantId, unitIds, occurrences } = args;
  if (!unitIds.length || !occurrences.length) return [];
  const minStart = new Date(Math.min(...occurrences.map((o) => o.start.getTime())));
  const maxEnd = new Date(Math.max(...occurrences.map((o) => o.end.getTime())));
  const holdRows = rowsOf<{ booking_id: string; s: unknown; e: unknown }>(
    await tx.execute(sql`
      select booking_id, lower(during) as s, upper(during) as e
      from unit_occupancy
      where tenant_id = ${tenantId} and kind = 'hold'
        and unit_id in (${unitList(unitIds)})
        and during && ${tsrange(minStart, maxEnd)}`),
  );
  const ids = new Set<string>();
  for (const row of holdRows) {
    const s = toDate(row.s);
    const e = toDate(row.e);
    if (occurrences.some((o) => overlaps(s, e, o.start, o.end))) ids.add(row.booking_id);
  }
  if (!ids.size) return [];
  const list = [...ids];
  await tx.delete(unitOccupancy).where(and(eq(unitOccupancy.tenantId, tenantId), inArray(unitOccupancy.bookingId, list)));
  const released = await tx
    .update(bookings)
    .set({
      status: "abandoned",
      paymentStatus: sql`case when ${bookings.paymentIntentId} is null then ${bookings.paymentStatus} else 'canceled'::payment_status end`,
      checkoutExpiresAt: null,
      updatedAt: args.now,
      version: sql`${bookings.version} + 1`,
    })
    .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, list), eq(bookings.status, "checking_out")))
    .returning({ id: bookings.id, paymentIntentId: bookings.paymentIntentId });
  for (const b of released) {
    await writeAudit(tx, {
      tenantId,
      actorType: args.actorId ? "staff" : "system",
      actorId: args.actorId,
      action: "booking.abandon",
      targetType: "booking",
      targetId: b.id,
      reason: "Checkout hold removed by a staff block",
      at: args.now,
    });
  }
  return released.map((b) => ({ bookingId: b.id, paymentIntentId: b.paymentIntentId }));
}

export interface ConflictRow {
  bookingId: string;
  status: (typeof bookings.$inferSelect)["status"];
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  resourceId: string;
  customerName: string;
  occurrenceDate: string | null;
}

/** Bookings (not holds) whose occupancy overlaps any occurrence on these units. */
export async function findBlockConflicts(
  tx: Tx,
  args: { tenantId: string; unitIds: string[]; occurrences: Occurrence[] },
): Promise<ConflictRow[]> {
  const { tenantId, unitIds, occurrences } = args;
  if (!unitIds.length || !occurrences.length) return [];
  const minStart = new Date(Math.min(...occurrences.map((o) => o.start.getTime())));
  const maxEnd = new Date(Math.max(...occurrences.map((o) => o.end.getTime())));
  const rows = rowsOf<{
    booking_id: string;
    s: unknown;
    e: unknown;
    status: ConflictRow["status"];
    starts_at: unknown;
    ends_at: unknown;
    price_cents: number;
    resource_id: string;
    customer_name: string | null;
  }>(
    await tx.execute(sql`
      select o.booking_id, lower(o.during) as s, upper(o.during) as e,
             b.status, b.starts_at, b.ends_at, b.price_cents, b.resource_id,
             c.name as customer_name
      from unit_occupancy o
      join bookings b on b.id = o.booking_id
      left join customers c on c.id = b.customer_id
      where o.tenant_id = ${tenantId} and o.kind = 'booking'
        and o.unit_id in (${unitList(unitIds)})
        and o.during && ${tsrange(minStart, maxEnd)}
      order by b.starts_at`),
  );
  const seen = new Set<string>();
  const out: ConflictRow[] = [];
  for (const row of rows) {
    const s = toDate(row.s);
    const e = toDate(row.e);
    for (const occ of occurrences) {
      if (!overlaps(s, e, occ.start, occ.end)) continue;
      const key = `${row.booking_id}|${occ.date ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        bookingId: row.booking_id,
        status: row.status,
        startsAt: toDate(row.starts_at),
        endsAt: toDate(row.ends_at),
        priceCents: Number(row.price_cents),
        resourceId: row.resource_id,
        customerName: row.customer_name ?? "Walk-in",
        occurrenceDate: occ.date,
      });
    }
  }
  return out;
}

/** Last local date weekly occurrences are materialized through. */
export function materializeHorizon(now: Date, zone: string, bookingWindowDays: number): string {
  return addDays(localDate(now, zone), bookingWindowDays + 30);
}
