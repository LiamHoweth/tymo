import { DateTime } from "luxon";

/**
 * Display helpers for the booking flow. Instants are ISO UTC strings; every
 * label is rendered in the facility's time zone (never the phone's).
 */

const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
const onDate = (date: string, zone: string) => DateTime.fromISO(date, { zone });

/** "Sat, Dec 5" */
export function shortDay(iso: string, zone: string): string {
  return at(iso, zone).toFormat("ccc, LLL d");
}

/** "Saturday, December 5" */
export function longDay(iso: string, zone: string): string {
  return at(iso, zone).toFormat("cccc, LLLL d");
}

/** "5:00 PM" */
export function clock(iso: string, zone: string): string {
  return at(iso, zone).toFormat("h:mm a");
}

/** "5:00–6:30 PM", or "11:30 AM–1:00 PM" across noon. */
export function compactRange(startLocal: string, endLocal: string): string {
  const [s, sm] = startLocal.split(" ");
  const [e, em] = endLocal.split(" ");
  if (sm && em && sm === em) return `${s}–${e} ${em}`;
  return `${startLocal}–${endLocal}`;
}

/** "5:00 to 6:30 PM" (review line wording). */
export function wordsRange(startIso: string, endIso: string, zone: string): string {
  const s = clock(startIso, zone);
  const e = clock(endIso, zone);
  const [sh, sm] = s.split(" ");
  const [, em] = e.split(" ");
  return sm === em ? `${sh} to ${e}` : `${s} to ${e}`;
}

/** "Thu, Dec 3 at 5:00 PM" */
export function dayAndTime(iso: string, zone: string): string {
  return at(iso, zone).toFormat("ccc, LLL d 'at' h:mm a");
}

/** For a facility-local date "2026-11-26": "Thu, Nov 26" */
export function dateShort(date: string, zone: string): string {
  return onDate(date, zone).toFormat("ccc, LLL d");
}

/** For a facility-local date: "Thursday, Nov 26" (closed-day wording). */
export function dateWeekdayLong(date: string, zone: string): string {
  return onDate(date, zone).toFormat("cccc, LLL d");
}

/** "Jan 21, 2027" */
export function dateWithYear(date: string, zone: string): string {
  return onDate(date, zone).toFormat("LLL d, yyyy");
}

export function todayIn(zone: string): string {
  return DateTime.now().setZone(zone).toISODate()!;
}

export function addDays(date: string, days: number, zone: string): string {
  return onDate(date, zone).plus({ days }).toISODate()!;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid;
}

/** "Central Time" for America/Chicago. Falls back to the short label. */
export function zoneLongName(zone: string, fallback: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? fallback;
  } catch {
    return fallback;
  }
}

/** True when the booking starts inside the facility's cancellation cutoff. */
export function insideCancelCutoff(startsAt: string, cutoffMinutes: number): boolean {
  return DateTime.fromISO(startsAt).minus({ minutes: cutoffMinutes }) <= DateTime.now();
}

/** Last moment a booking can be cancelled online, as an ISO instant. */
export function freeCancelUntil(startsAt: string, cutoffMinutes: number): string {
  return DateTime.fromISO(startsAt, { zone: "utc" }).minus({ minutes: cutoffMinutes }).toISO()!;
}

/** 2880 -> "48 hours", 60 -> "1 hour", 90 -> "90 minutes" */
export function spanWords(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** "24 hours'" (as in "Requests need 24 hours' notice"). */
export function noticeWords(minutes: number): string {
  const span = spanWords(minutes);
  return span.endsWith("s") ? `${span}'` : `${span}'s`;
}
