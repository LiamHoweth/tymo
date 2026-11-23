import { DateTime } from "luxon";
import type { CalendarDay, CalendarItemKind, CalendarRow } from "@tymo/shared/types";
import { fromHHMM, joinTimes, rangeLabel, toHHMM } from "../format";

/**
 * Turns the engine's CalendarDay (UTC instants) into minute positions on the
 * facility's local day, plus a per-field agenda with open gaps. Runs on the
 * server (Luxon + the facility zone); the client gets plain numbers.
 */

export interface PlacedItem {
  id: string;
  kind: CalendarItemKind;
  label: string;
  bookingId?: string;
  blockId?: string;
  occurrenceDate?: string;
  /** Minutes after local midnight, clamped to the display window. */
  startMin: number;
  endMin: number;
  /** False when the item sits wholly outside the display window. */
  visible: boolean;
  /** "3:00 to 5:30 PM", or "All day" for full-day closures. */
  timeLabel: string;
  /** Covers every unit of the row (full field, or an unsplit field). */
  full: boolean;
  /** Lanes (halves) it covers on a split row. */
  laneIds: string[];
  /** "N1" for the whole field, "N1A" for a half. */
  scopeCode: string;
}

export interface OpenSlot {
  startMin: number;
  endMin: number;
  timeLabel: string;
  /** Resource a block here would cover: the field, or one free half. */
  resourceId: string;
  code: string;
  full: boolean;
  startHHMM: string;
  endHHMM: string;
}

export type AgendaEntry = { type: "item"; item: PlacedItem } | { type: "open"; slot: OpenSlot };

export interface RowModel {
  resourceId: string;
  code: string;
  name: string;
  lanes: { resourceId: string; code: string; label: string }[];
  items: PlacedItem[];
  agenda: AgendaEntry[];
}

export interface DayModel {
  date: string;
  dateLabel: string;
  timeZoneLabel: string;
  startMin: number;
  endMin: number;
  /** Set when this day is today in the facility zone. */
  nowMin: number | null;
  isToday: boolean;
  isPast: boolean;
  rows: RowModel[];
}

const DAY = 24 * 60;
const MIN_OPEN = 30;

/** Raw local minutes on `date`: <0 before the day, >1440 after it. */
function localMinutes(iso: string, date: string, zone: string): number {
  const dt = DateTime.fromISO(iso, { zone });
  const d = dt.toISODate();
  if (!d) return 0;
  if (d < date) return -1;
  if (d > date) return DAY + 1;
  return dt.hour * 60 + dt.minute;
}

function buildRow(row: CalendarRow, date: string, zone: string, startMin: number, endMin: number, nowMin: number | null, isPast: boolean): RowModel {
  const rowUnits = row.unitCodes.length ? row.unitCodes : ["*"];
  const lanes = row.lanes.map((l) => ({ resourceId: l.resourceId, code: l.code, label: l.label, units: l.unitCodes }));

  const items: (PlacedItem & { units: string[]; rawStart: number })[] = row.items.map((it) => {
    const rawStart = localMinutes(it.startsAt, date, zone);
    const rawEnd = localMinutes(it.endsAt, date, zone);
    const units = it.unitCodes.length ? it.unitCodes : rowUnits;
    const full = rowUnits.every((u) => u === "*" || units.includes(u));
    const covered = lanes.filter((l) => l.units.some((u) => units.includes(u)));
    const s = Math.max(startMin, Math.min(endMin, rawStart));
    const e = Math.max(startMin, Math.min(endMin, rawEnd));
    const allDay = it.kind === "closure" && rawStart <= 0 && rawEnd >= DAY;
    return {
      id: it.id,
      kind: it.kind,
      label: it.label,
      bookingId: it.bookingId,
      blockId: it.blockId,
      occurrenceDate: it.occurrenceDate,
      startMin: s,
      endMin: e,
      visible: e > s,
      timeLabel: allDay ? "All day" : joinTimes(it.startLocal, it.endLocal),
      full,
      laneIds: covered.map((l) => l.resourceId),
      scopeCode: full || covered.length === 0 ? row.code : covered.map((l) => l.code).join(", "),
      units,
      rawStart,
    };
  });

  // Open time: walk the window between every item edge and see which units are free.
  const open: OpenSlot[] = [];
  if (!isPast) {
    let from = startMin;
    if (nowMin !== null) from = Math.max(startMin, Math.ceil(nowMin / 30) * 30);
    const edges = new Set<number>([from, endMin]);
    for (const it of items) {
      if (it.startMin > from && it.startMin < endMin) edges.add(it.startMin);
      if (it.endMin > from && it.endMin < endMin) edges.add(it.endMin);
    }
    const sorted = [...edges].filter((m) => m >= from && m <= endMin).sort((a, b) => a - b);
    type Seg = { a: number; b: number; state: string };
    const segs: Seg[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const busy = new Set<string>();
      for (const it of items) if (it.startMin < b && it.endMin > a) it.units.forEach((u) => busy.add(u));
      let state: string;
      if (!rowUnits.some((u) => busy.has(u) || (u === "*" && busy.size > 0))) state = "all";
      else {
        const free = lanes.filter((l) => !l.units.some((u) => busy.has(u)));
        state = free.length ? `lanes:${free.map((l) => l.resourceId).join(",")}` : "none";
      }
      const last = segs[segs.length - 1];
      if (last && last.state === state && last.b === a) last.b = b;
      else segs.push({ a, b, state });
    }
    for (const seg of segs) {
      if (seg.b - seg.a < MIN_OPEN || seg.state === "none") continue;
      const base = { startMin: seg.a, endMin: seg.b, timeLabel: rangeLabel(seg.a, seg.b), startHHMM: toHHMM(seg.a), endHHMM: toHHMM(seg.b) };
      if (seg.state === "all") open.push({ ...base, resourceId: row.resourceId, code: row.code, full: true });
      else {
        const ids = seg.state.slice(6).split(",");
        for (const l of lanes) if (ids.includes(l.resourceId)) open.push({ ...base, resourceId: l.resourceId, code: l.code, full: false });
      }
    }
  }

  const agenda: AgendaEntry[] = [
    ...items.map((item) => ({ type: "item" as const, item, at: item.rawStart })),
    ...open.map((slot) => ({ type: "open" as const, slot, at: slot.startMin })),
  ]
    .sort((x, y) => x.at - y.at || (x.type === "item" ? -1 : 1))
    .map((e) => (e.type === "item" ? { type: "item" as const, item: e.item } : { type: "open" as const, slot: e.slot }));

  return {
    resourceId: row.resourceId,
    code: row.code,
    name: row.name,
    lanes: lanes.map(({ resourceId, code, label }) => ({ resourceId, code, label })),
    items: items.map((it) => {
      const { units, rawStart, ...placed } = it;
      void units;
      void rawStart;
      return placed;
    }),
    agenda,
  };
}

export function buildDay(day: CalendarDay, zone: string): DayModel {
  const now = DateTime.now().setZone(zone);
  const today = now.toISODate();
  const isToday = day.date === today;
  const isPast = today !== null && day.date < today;
  const startMin = fromHHMM(day.dayStartLocal || "07:00");
  const endRaw = fromHHMM(day.dayEndLocal || "21:00");
  const endMin = endRaw <= startMin ? DAY : endRaw;
  const nowMin = isToday ? now.hour * 60 + now.minute : null;
  return {
    date: day.date,
    dateLabel: day.dateLabel,
    timeZoneLabel: day.timeZoneLabel,
    startMin,
    endMin,
    nowMin,
    isToday,
    isPast,
    rows: day.rows.map((row) => buildRow(row, day.date, zone, startMin, endMin, nowMin, isPast)),
  };
}

/** Words for each kind, used in lists, legends and screen-reader labels. */
export const KIND_WORD: Record<CalendarItemKind, string> = {
  booking: "Booked",
  request: "Request",
  block: "Block",
  closure: "Closed",
  hold: "Checking out",
};
