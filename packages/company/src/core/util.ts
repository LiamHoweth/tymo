import { randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

/**
 * Raw timestamptz values come back from the drivers as text
 * ("2026-12-05 16:00:00+00"); typed Drizzle columns come back as Date.
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    let s = value.trim().replace(" ", "T");
    if (/[+-]\d\d$/.test(s)) s += ":00";
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof value === "number") return new Date(value);
  throw new Error(`Not a timestamp: ${String(value)}`);
}

/** Rows from tx.execute() on either driver. */
export function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] } | T[];
  if (Array.isArray(r)) return r;
  return r.rows ?? [];
}

/** '[start,end)' text form for a tstzrange column. */
export function rangeLiteral(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

/** Parse a tstzrange's text form ('["2026-12-05 16:00:00+00","2026-12-05 17:30:00+00")') into instants. */
export function parseRange(text: unknown): { start: Date; end: Date } {
  const inner = String(text).trim().slice(1, -1);
  const [a, b] = inner.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
  return { start: toDate(a), end: toDate(b) };
}

/** SQL expression for a half-open tstzrange. */
export function tsrange(start: Date, end: Date): SQL {
  return sql`tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')`;
}

/** Walk an error's cause chain looking for a Postgres SQLSTATE. */
export function sqlState(err: unknown): string | null {
  let e: unknown = err;
  for (let i = 0; i < 6 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** SQLSTATE 23P01: the unit_occupancy exclusion constraint fired. */
export function isExclusionViolation(err: unknown): boolean {
  return sqlState(err) === "23P01";
}

/** URL-safe random capability token (32 random bytes, base64url). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Subtract intervals from [start, end); returns the remaining pieces in order. */
export function subtractIntervals(
  start: Date,
  end: Date,
  cuts: { start: Date; end: Date }[],
): { start: Date; end: Date }[] {
  let pieces = [{ s: start.getTime(), e: end.getTime() }];
  for (const cut of cuts) {
    const cs = cut.start.getTime();
    const ce = cut.end.getTime();
    const next: { s: number; e: number }[] = [];
    for (const p of pieces) {
      if (ce <= p.s || cs >= p.e) {
        next.push(p);
        continue;
      }
      if (cs > p.s) next.push({ s: p.s, e: cs });
      if (ce < p.e) next.push({ s: ce, e: p.e });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.e > p.s).map((p) => ({ start: new Date(p.s), end: new Date(p.e) }));
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
