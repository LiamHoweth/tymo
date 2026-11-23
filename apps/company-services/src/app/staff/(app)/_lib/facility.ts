import "server-only";
import { cache } from "react";
import { DateTime } from "luxon";
import type { StaffSession } from "@tymo/platform/auth";
import { getFacility } from "@tymo/company/public";

/**
 * The facility's IANA zone. StaffSession does not carry it, so it is read
 * from the facility record once per request. "Today" and calendar math use
 * it so a phone in any zone sees the facility's day.
 */
const zoneForSlug = cache(async (slug: string): Promise<string> => {
  const facility = await getFacility(slug);
  // Schema default; only used if the facility lookup comes back empty.
  return facility?.timeZone ?? "America/Chicago";
});

export function facilityTimeZone(session: StaffSession): Promise<string> {
  return zoneForSlug(session.tenantSlug);
}

/** Facility-local "YYYY-MM-DD" for now. */
export function todayIn(timeZone: string): string {
  return DateTime.now().setZone(timeZone).toISODate() ?? DateTime.now().toISODate()!;
}

/** Accepts only a real calendar date in "YYYY-MM-DD" form. */
export function validDate(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return DateTime.fromISO(value).isValid ? value : null;
}

/** First string value of a search param. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
