import { createHash, randomBytes } from "node:crypto";

/**
 * Token helpers for staff sign-in. Pure (no DB, no Next APIs) so they are
 * unit tested directly. Only sha256 hashes of tokens are stored; the raw
 * token exists in the emailed link or the cookie and nowhere else.
 */

export const SESSION_COOKIE = "tymo_session";
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** 32 random bytes, base64url (43 chars). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hex sha256 of a token; what the database stores. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap shape check before touching the database. */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function magicLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_MS);
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export type MagicLinkCheck = "ok" | "invalid" | "expired" | "used";

/** Decide whether a stored magic link can be used now. Used beats expired: say "already used" when both are true. */
export function checkMagicLink(link: { expiresAt: Date; usedAt: Date | null } | null | undefined, now: Date = new Date()): MagicLinkCheck {
  if (!link) return "invalid";
  if (link.usedAt) return "used";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

export function sessionCookieOptions(isProd: boolean, expires: Date) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Lower-cased, trimmed email, or null when it isn't plausibly an address. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
