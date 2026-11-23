import { and, eq, isNull, sql } from "drizzle-orm";
import type { DateChip, DayAvailability, SlotOption, SlotUnavailableReason } from "@/lib/types";
import type { Tx } from "@/server/db/client";
import { blocks, operatingHours, rateBands, tenants } from "@/server/db/schema";
import { blockOccurrences, type BlockRow } from "./blocks";
import { priceCents, type RateBand } from "./rules";
import {
  addDays,
  atLocal,
  atLocalLenient,
  chipDateLabel,
  dateRange,
  localDate,
  minutesOfDay,
  periodOf,
  shortDateLabel,
  startOfLocalDate,
  timeLabel,
  weekdayOf,
} from "./time";
import { blockUnitIds, type ResourceRow, type UnitMap } from "./units";
import { MINUTE, overlaps, rowsOf, subtractIntervals, toDate, tsrange } from "./util";

export type TenantRow = typeof tenants.$inferSelect;
export type HoursRow = typeof operatingHours.$inferSelect;

export interface Interval {
  start: Date;
  end: Date;
}

export interface ClosureInterval extends Interval {
  reason: string | null;
}

export interface Busy {
  /** Bookings, live checkout holds and non-closure blocks: "Not available". */
  taken: (Interval & { bookingId?: string; blockId?: string })[];
  /** Closures: "Closed". */
  closures: ClosureInterval[];
}

export async function loadHours(tx: Tx, tenantId: string): Promise<HoursRow[]> {
  return tx.select().from(operatingHours).where(eq(operatingHours.tenantId, tenantId));
}

/** A resource's hours for a weekday: its own rows if it has any that day, else the venue's. */
export function hoursFor(hours: HoursRow[], resourceId: string, weekday: number): { opensAt: string; closesAt: string }[] {
  const own = hours.filter((h) => h.resourceId === resourceId && h.weekday === weekday);
  const rows = own.length ? own : hours.filter((h) => h.resourceId === null && h.weekday === weekday);
  return rows.map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt })).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

/** Open windows on a local date as instants. */
export function openWindows(hours: HoursRow[], resourceId: string, date: string, zone: string): (Interval & { opensAt: string; closesAt: string })[] {
  return hoursFor(hours, resourceId, weekdayOf(date))
    .map((h) => ({
      opensAt: h.opensAt,
      closesAt: h.closesAt,
      start: atLocalLenient(date, h.opensAt, zone),
      end: atLocal(date, h.closesAt, zone) ?? atLocalLenient(date, h.closesAt, zone),
    }))
    .filter((w) => w.end > w.start);
}

export async function loadActiveBlocks(tx: Tx, tenantId: string, from: Date, to: Date, zone: string): Promise<BlockRow[]> {
  const fromDate = addDays(localDate(from, zone), -1);
  const toDate_ = addDays(localDate(to, zone), 1);
  return tx
    .select()
    .from(blocks)
    .where(
      and(
        eq(blocks.tenantId, tenantId),
        isNull(blocks.deletedAt),
        sql`((${blocks.kind} = 'weekly' and ${blocks.endDate} >= ${fromDate} and ${blocks.startDate} <= ${toDate_})
          or (${blocks.kind} <> 'weekly' and ${blocks.startsAt} < ${to.toISOString()}::timestamptz and ${blocks.endsAt} > ${from.toISOString()}::timestamptz))`,
      ),
    );
}

/**
 * Everything that makes these units unavailable in [from, to): booking and
 * live hold occupancy rows, plus block occurrences expanded from the blocks
 * table (so weekly occurrences beyond the materialized horizon still count).
 */
export async function loadBusy(
  tx: Tx,
  args: {
    tenant: TenantRow;
    map: UnitMap;
    unitIds: string[];
    from: Date;
    to: Date;
    now: Date;
    excludeBookingId?: string;
  },
): Promise<Busy> {
  const { tenant, map, unitIds, from, to, now } = args;
  const busy: Busy = { taken: [], closures: [] };
  if (!unitIds.length) return busy;
  const unitSql = sql.join(
    unitIds.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  const occ = rowsOf<{ booking_id: string | null; s: unknown; e: unknown }>(
    await tx.execute(sql`
      select booking_id, lower(during) as s, upper(during) as e
      from unit_occupancy
      where tenant_id = ${tenant.id}
        and unit_id in (${unitSql})
        and kind in ('hold', 'booking')
        and (kind <> 'hold' or hold_expires_at > ${now.toISOString()}::timestamptz)
        and during && ${tsrange(from, to)}`),
  );
  for (const row of occ) {
    if (args.excludeBookingId && row.booking_id === args.excludeBookingId) continue;
    busy.taken.push({ start: toDate(row.s), end: toDate(row.e), bookingId: row.booking_id ?? undefined });
  }
  const unitSet = new Set(unitIds);
  for (const block of await loadActiveBlocks(tx, tenant.id, from, to, tenant.timeZone)) {
    const bUnits = blockUnitIds(map, block.resourceId);
    if (!bUnits.some((u) => unitSet.has(u))) continue;
    for (const o of blockOccurrences(block, tenant.timeZone, { from, to })) {
      if (block.kind === "closure") busy.closures.push({ start: o.start, end: o.end, reason: block.publicReason });
      else busy.taken.push({ start: o.start, end: o.end, blockId: block.id });
    }
  }
  return busy;
}

export async function loadRateBands(tx: Tx, tenantId: string, resourceId: string): Promise<RateBand[]> {
  const rows = await tx
    .select()
    .from(rateBands)
    .where(and(eq(rateBands.tenantId, tenantId), eq(rateBands.resourceId, resourceId)));
  return rows.map((r) => ({ weekdays: r.weekdays, startsAt: r.startsAt, endsAt: r.endsAt, priceCentsPerHour: r.priceCentsPerHour }));
}

/** Clamp a requested duration to the resource's min/max, in slot steps. */
export function normalizeDuration(resource: ResourceRow, minutes: number): number {
  const step = Math.max(1, resource.slotMinutes);
  let d = Number.isFinite(minutes) ? Math.round(minutes) : resource.minMinutes;
  d = Math.max(resource.minMinutes, Math.min(resource.maxMinutes, d));
  return Math.ceil(d / step) * step;
}

export function isValidDuration(resource: ResourceRow, minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= resource.minMinutes &&
    minutes <= resource.maxMinutes &&
    minutes % Math.max(1, resource.slotMinutes) === 0
  );
}

/**
 * Start times for one resource, local date and duration. A start is
 * available only when every unit is free for duration + buffer, inside
 * opening hours, after the lead time and inside the booking window.
 * Slots are generated per local date with Luxon: times that don't exist
 * (spring forward) are skipped, repeated ones (fall back) listed once.
 */
export async function computeDayAvailability(
  tx: Tx,
  args: {
    tenant: TenantRow;
    map: UnitMap;
    hours: HoursRow[];
    resource: ResourceRow;
    date: string;
    durationMinutes: number;
    now: Date;
  },
): Promise<DayAvailability> {
  const { tenant, map, hours, resource, date, now } = args;
  const zone = tenant.timeZone;
  const duration = normalizeDuration(resource, args.durationMinutes);
  const unitIds = map.unitsOf.get(resource.id) ?? [];
  const today = localDate(now, zone);
  const lastDate = addDays(today, tenant.bookingWindowDays);
  const leadEdge = now.getTime() + tenant.leadTimeMinutes * MINUTE;
  const base: DayAvailability = {
    date,
    dateLabel: shortDateLabel(date, zone),
    resourceId: resource.id,
    durationMinutes: duration,
    closed: false,
    slots: [],
  };
  if (date > lastDate) base.dayReason = "too_far";
  else if (date < today) base.dayReason = "too_soon";

  const windows = openWindows(hours, resource.id, date, zone);
  if (!windows.length || !resource.active) return { ...base, closed: true };

  const from = windows[0].start;
  const to = new Date(Math.max(...windows.map((w) => w.end.getTime())) + resource.bufferMinutes * MINUTE);
  const busy = await loadBusy(tx, { tenant, map, unitIds, from, to, now });

  const fullyClosed = windows.every((w) => subtractIntervals(w.start, w.end, busy.closures).length === 0);
  if (fullyClosed && busy.closures.length) {
    const reason = busy.closures.find((c) => c.reason)?.reason ?? undefined;
    return { ...base, closed: true, ...(reason ? { closedReason: reason } : {}) };
  }

  const bands = await loadRateBands(tx, tenant.id, resource.id);
  const seen = new Set<number>();
  const slots: SlotOption[] = [];
  for (const w of windows) {
    const openMin = minutesOfDay(w.opensAt);
    const closeMin = minutesOfDay(w.closesAt);
    for (let m = openMin; m + duration <= closeMin; m += Math.max(1, resource.slotMinutes)) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const start = atLocal(date, hhmm, zone);
      if (!start || seen.has(start.getTime())) continue;
      const end = new Date(start.getTime() + duration * MINUTE);
      if (end > w.end) continue;
      seen.add(start.getTime());
      const bufferEnd = new Date(end.getTime() + resource.bufferMinutes * MINUTE);
      let reason: SlotUnavailableReason | undefined;
      if (busy.closures.some((c) => overlaps(start, end, c.start, c.end))) reason = "closed";
      else if (base.dayReason === "too_far") reason = "too_far";
      else if (start.getTime() < leadEdge) reason = "too_soon";
      else if (busy.taken.some((t) => overlaps(start, bufferEnd, t.start, t.end))) reason = "taken";
      slots.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        startLocal: timeLabel(start, zone),
        endLocal: timeLabel(end, zone),
        period: periodOf(start, zone),
        available: !reason,
        ...(reason ? { reason } : {}),
        priceCents: priceCents(resource.priceCentsPerHour, bands, start, end, zone),
      });
    }
  }
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (!base.dayReason && slots.length && slots.every((s) => s.reason === "too_soon")) base.dayReason = "too_soon";
  return { ...base, slots };
}

/** Date strip: `days` local dates from today, with closed / bookable flags. */
export async function computeDateChips(
  tx: Tx,
  args: { tenant: TenantRow; map: UnitMap; hours: HoursRow[]; resource: ResourceRow; days: number; now: Date },
): Promise<DateChip[]> {
  const { tenant, map, hours, resource, now } = args;
  const zone = tenant.timeZone;
  const days = Math.max(1, Math.min(120, Math.floor(args.days)));
  const today = localDate(now, zone);
  const lastDate = addDays(today, tenant.bookingWindowDays);
  const leadEdge = now.getTime() + tenant.leadTimeMinutes * MINUTE;
  const dates = dateRange(today, addDays(today, days - 1));
  const from = startOfLocalDate(today, zone).toJSDate();
  const to = startOfLocalDate(addDays(today, days), zone).toJSDate();
  const busy = await loadBusy(tx, { tenant, map, unitIds: map.unitsOf.get(resource.id) ?? [], from, to, now });
  return dates.map((date) => {
    const windows = resource.active ? openWindows(hours, resource.id, date, zone) : [];
    const closed =
      !windows.length ||
      (busy.closures.length > 0 && windows.every((w) => subtractIntervals(w.start, w.end, busy.closures).length === 0));
    const lastStartOk = windows.some((w) => w.end.getTime() - resource.minMinutes * MINUTE >= leadEdge);
    return {
      date,
      label: chipDateLabel(date, zone),
      closed,
      bookable: !closed && date <= lastDate && lastStartOk,
    };
  });
}
