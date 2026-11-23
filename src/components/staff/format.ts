/** Small display helpers for the staff app (pure; safe on server and client). */

/** "Jordan Reyes" -> "Jordan" */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || "the customer";
}

/** "Jordan" -> "Jordan's" */
export function possessive(name: string): string {
  return `${name}'s`;
}

/** Minutes after local midnight -> "5:30 PM". 1440 reads "12:00 AM". */
export function clockLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  const meridiem = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

/** "3:00 PM" + "5:30 PM" -> "3:00 to 5:30 PM"; "11:00 AM" + "1:00 PM" -> "11:00 AM to 1:00 PM". */
export function joinTimes(start: string, end: string): string {
  const s = start.match(/^(.*)\s(AM|PM)$/i);
  const e = end.match(/^(.*)\s(AM|PM)$/i);
  if (s && e && s[2].toUpperCase() === e[2].toUpperCase()) return `${s[1]} to ${end}`;
  return `${start} to ${end}`;
}

/** Minutes range -> "5:30 to 7:30 PM". */
export function rangeLabel(startMin: number, endMin: number): string {
  return joinTimes(clockLabel(startMin), clockLabel(endMin));
}

/** "17:30" -> "5:30 PM" */
export function hhmmLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return clockLabel(h * 60 + (m || 0));
}

/** Minutes after midnight -> "17:30" (for time inputs and URLs). */
export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "17:30" -> 1050 */
export function fromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Noon avoids any DST edge when only the calendar date matters.
  return new Date(y, m - 1, d, 12);
}

/** "2026-12-14" -> "Dec 14" */
export function shortDate(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2026-12-14" -> "Mon Dec 14" */
export function weekdayDate(ymd: string): string {
  const d = parseYmd(ymd);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${wd} ${shortDate(ymd)}`;
}

/** ISO weekday (1 = Monday) names. */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Joins a list for prose: "A", "A and B", "A, B and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "1 date" / "3 dates" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Live countdown text in the queue's wording: "1 day 22 hr", "1 hr 40 min", "12 min". */
export function expiresInLabel(msLeft: number): string {
  if (msLeft <= 0) return "now";
  const totalMin = Math.floor(msLeft / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days} day${days > 1 ? "s" : ""} ${hours} hr` : `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  return `${Math.max(mins, 1)} min`;
}
