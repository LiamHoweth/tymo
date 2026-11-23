import { DateTime } from "luxon";

/**
 * Date and time wording for emails, always in the facility's time zone.
 * Pure functions (no server-only) so templates can be unit tested.
 */

function local(at: Date, timeZone: string): DateTime {
  return DateTime.fromJSDate(at, { zone: timeZone }).setLocale("en-US");
}

/**
 * Short zone label: "CT", "ET", "MT", "PT" for US zones (Luxon gives
 * "CST"/"CDT"; people write "CT" all year). Other zones keep Luxon's
 * short name ("GMT+1", "UTC").
 */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  const short = local(at, timeZone).toFormat("ZZZZ");
  if (/^(America|US|Pacific\/Honolulu)/.test(timeZone)) {
    const m = short.match(/^([A-Z]+)[SD]T$/);
    if (m) return `${m[1]}T`;
  }
  return short;
}

/** "Sat, Dec 5" */
export function dateLabel(at: Date, timeZone: string): string {
  return local(at, timeZone).toFormat("ccc, LLL d");
}

/** "Sat Dec 5" (subjects and staff lists) */
export function dateShort(at: Date, timeZone: string): string {
  return local(at, timeZone).toFormat("ccc LLL d");
}

/** "5:00 PM" */
export function timeLabel(at: Date, timeZone: string): string {
  return local(at, timeZone).toFormat("h:mm a");
}

/**
 * "5:00–6:30 PM" (same half of the day) or "11:00 AM–1:00 PM".
 * Pass sep " to " for the staff wording "10:00 to 11:30 AM".
 */
export function timeRange(start: Date, end: Date, timeZone: string, sep = "–"): string {
  const s = local(start, timeZone);
  const e = local(end, timeZone);
  if (s.toFormat("a") === e.toFormat("a")) return `${s.toFormat("h:mm")}${sep}${e.toFormat("h:mm a")}`;
  return `${s.toFormat("h:mm a")}${sep}${e.toFormat("h:mm a")}`;
}

/** "Tue, Nov 24 at 8:00 PM CT" */
export function dateTimeLabel(at: Date, timeZone: string): string {
  return `${local(at, timeZone).toFormat("ccc, LLL d 'at' h:mm a")} ${zoneLabel(timeZone, at)}`;
}

/** "Tue Nov 24, 8:00 PM CT" (staff wording) */
export function dateTimeShort(at: Date, timeZone: string): string {
  return `${local(at, timeZone).toFormat("ccc LLL d, h:mm a")} ${zoneLabel(timeZone, at)}`;
}

/** First word of a name: "Jamie Rivera" -> "Jamie". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
