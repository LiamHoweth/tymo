import { timingSafeEqual } from "node:crypto";

/** True when an Authorization header is exactly `Bearer <secret>` (constant-time compare). */
export function isAuthorizedBearer(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
