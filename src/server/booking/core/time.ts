import { DateTime } from "luxon";

/**
 * Facility-time helpers. Instants are JS Dates (UTC); every rule and label
 * uses the facility's IANA zone. Local dates are "YYYY-MM-DD", local times
 * "HH:MM" (24 h, "24:00" allowed for closing at midnight).
 */

const LOCALE = "en-US";

export function dt(at: Date, zone: string): DateTime {
  return DateTime.fromJSDate(at, { zone }).setLocale(LOCALE);
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid;
}

export function isValidTime(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return (h < 24 && min < 60) || (h === 24 && min === 0);
}

/** Start of a local date in the zone. */
export function startOfLocalDate(date: string, zone: string): DateTime {
  return DateTime.fromISO(date, { zone }).setLocale(LOCALE).startOf("day");
}

/** Local date of an instant. */
export function localDate(at: Date, zone: string): string {
  return dt(at, zone).toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "UTC" }).plus({ days }).toISODate()!;
}

export function weekdayOf(date: string): number {
  return DateTime.fromISO(date, { zone: "UTC" }).weekday;
}

/** Inclusive list of local dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  for (let i = 0; d <= to && i < 4000; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/**
 * Instant for a local wall-clock time on a local date, or null when that
 * time does not exist (spring-forward gap). "24:00" = start of next day.
 * Repeated times (fall back) resolve to the first occurrence.
 */
export function atLocal(date: string, hhmm: string, zone: string): Date | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 24) return startOfLocalDate(addDays(date, 1), zone).toJSDate();
  const [y, mo, d] = date.split("-").map(Number);
  const local = DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: m }, { zone });
  if (!local.isValid || local.hour !== h || local.minute !== m || local.day !== d) return null;
  return local.toJSDate();
}

/** Like atLocal but shifts across a DST gap instead of returning null (blocks). */
export function atLocalLenient(date: string, hhmm: string, zone: string): Date {
  const exact = atLocal(date, hhmm, zone);
  if (exact) return exact;
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: m }, { zone }).toJSDate();
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "CT" for America/Chicago (CST/CDT), "ET", "MT", "PT"; otherwise the short name. */
export function zoneLabel(zone: string, at: Date = new Date()): string {
  const short = dt(at, zone).toFormat("ZZZZ");
  if (/^[A-Z][SD]T$/.test(short)) return `${short[0]}T`;
  return short;
}

/** "CST" / "CDT" for the instant. */
export function zoneAbbrev(zone: string, at: Date): string {
  return dt(at, zone).toFormat("ZZZZ");
}

/** "5:00 PM" */
export function timeLabel(at: Date, zone: string): string {
  return dt(at, zone).toFormat("h:mm a");
}

/** "5:00–6:30 PM" or "11:00 AM–1:00 PM" (sep "–"); "10:00 to 11:30 AM" with sep " to ". */
export function timeRangeLabel(start: Date, end: Date, zone: string, sep = "–"): string {
  const s = dt(start, zone);
  const e = dt(end, zone);
  if (s.toFormat("a") === e.toFormat("a")) return `${s.toFormat("h:mm")}${sep}${e.toFormat("h:mm a")}`;
  return `${s.toFormat("h:mm a")}${sep}${e.toFormat("h:mm a")}`;
}

/** "Sat, Dec 5" */
export function shortDateLabel(at: Date | string, zone: string): string {
  const d = typeof at === "string" ? startOfLocalDate(at, zone) : dt(at, zone);
  return d.toFormat("ccc, LLL d");
}

/** "Sat Dec 5" (date chips, queue) */
export function chipDateLabel(at: Date | string, zone: string): string {
  const d = typeof at === "string" ? startOfLocalDate(at, zone) : dt(at, zone);
  return d.toFormat("ccc LLL d");
}

/** "Sat, Dec 5 · 5:00–6:30 PM CT" */
export function checkoutWhenLabel(start: Date, end: Date, zone: string): string {
  return `${shortDateLabel(start, zone)} · ${timeRangeLabel(start, end, zone)} ${zoneLabel(zone, start)}`;
}

/** "Saturday, December 5, 5:00 to 6:30 PM CT" */
export function longWhenLabel(start: Date, end: Date, zone: string): string {
  return `${dt(start, zone).toFormat("cccc, LLLL d")}, ${timeRangeLabel(start, end, zone, " to ")} ${zoneLabel(zone, start)}`;
}

/** "Sat Dec 5 · 10:00 to 11:30 AM (1.5 hr)" */
export function queueWhenLabel(start: Date, end: Date, zone: string): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const hoursText = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1).replace(/\.0$/, "");
  return `${chipDateLabel(start, zone)} · ${timeRangeLabel(start, end, zone, " to ")} (${hoursText} hr)`;
}

/** "Tue, Nov 24 at 8:00 PM CT" */
export function atLabel(at: Date, zone: string): string {
  return `${shortDateLabel(at, zone)} at ${timeLabel(at, zone)} ${zoneLabel(zone, at)}`;
}

/** "1 day 22 hr" / "1 hr 40 min" / "35 min" */
export function durationLeftLabel(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `${hours} hr${mins ? ` ${mins} min` : ""}`;
  return `${mins} min`;
}

/** "Morning" before 12:00, "Afternoon" before 17:00, else "Evening". */
export function periodOf(at: Date, zone: string): "Morning" | "Afternoon" | "Evening" {
  const h = dt(at, zone).hour;
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** [1] -> "Monday", [1,3] -> "Monday and Wednesday", [1,3,5] -> "Monday, Wednesday and Friday" */
export function weekdaysLabel(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "3:00 PM" from "15:00" */
export function hhmmLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return DateTime.fromObject({ hour: h % 24, minute: m }, { zone: "UTC" }).setLocale(LOCALE).toFormat("h:mm a");
}

/** "3:00–5:30 PM" from "15:00", "17:30" */
export function hhmmRangeLabel(start: string, end: string): string {
  const s = hhmmLabel(start);
  const e = hhmmLabel(end);
  const sm = s.slice(-2);
  if (sm === e.slice(-2)) return `${s.slice(0, -3)}–${e}`;
  return `${s}–${e}`;
}
