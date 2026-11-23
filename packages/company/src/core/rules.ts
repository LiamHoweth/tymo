import { dt, minutesOfDay } from "./time";
import { HOUR, MINUTE } from "./util";

export interface DeadlineRules {
  approvalWindowMinutes: number;
  approvalCutoffBeforeStartMinutes: number;
  approvalWindowCapMinutes: number;
}

/**
 * Approval deadline = earliest of: request + window (48 h), start - cutoff
 * (2 h), Stripe capture_before - 1 h, request + hard cap (96 h).
 */
export function approvalDeadline(
  rules: DeadlineRules,
  requestedAt: Date,
  startsAt: Date,
  captureBefore: Date | null,
): Date {
  const candidates = [
    requestedAt.getTime() + rules.approvalWindowMinutes * MINUTE,
    startsAt.getTime() - rules.approvalCutoffBeforeStartMinutes * MINUTE,
    requestedAt.getTime() + rules.approvalWindowCapMinutes * MINUTE,
  ];
  if (captureBefore) candidates.push(captureBefore.getTime() - HOUR);
  return new Date(Math.min(...candidates));
}

export interface RateBand {
  weekdays: number[];
  startsAt: string; // "17:00"
  endsAt: string; // "21:00"
  priceCentsPerHour: number;
}

/**
 * Price by elapsed minutes: each minute is charged at the rate band that
 * covers its local weekday and time, else the resource's hourly price.
 */
export function priceCents(
  baseCentsPerHour: number,
  bands: RateBand[],
  start: Date,
  end: Date,
  zone: string,
): number {
  const minutes = Math.round((end.getTime() - start.getTime()) / MINUTE);
  if (minutes <= 0) return 0;
  if (!bands.length) return Math.round((baseCentsPerHour * minutes) / 60);
  let sum = 0; // cents-per-hour summed per minute
  let cursor = dt(start, zone);
  for (let i = 0; i < minutes; i++) {
    const wd = cursor.weekday;
    const m = cursor.hour * 60 + cursor.minute;
    const band = bands.find(
      (b) => b.weekdays.includes(wd) && m >= minutesOfDay(b.startsAt) && m < minutesOfDay(b.endsAt),
    );
    sum += band ? band.priceCentsPerHour : baseCentsPerHour;
    cursor = cursor.plus({ minutes: 1 });
  }
  return Math.round(sum / 60);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** 10-digit US number (a leading 1 is dropped), or null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
