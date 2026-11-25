import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tymo admin console session helpers. Pure (no DB, no Next APIs) so they
 * are unit tested directly; admin-session.ts wires them to cookies.
 *
 * A session token is `${base64url(user)}.${expiresAtMs}.${hmac}`. The HMAC
 * covers the first two parts and is keyed by sha256 of the secret, user
 * and password, so changing the admin password or SESSION_SECRET signs
 * everyone out. Nothing is stored server-side.
 */

export const ADMIN_COOKIE = "tymo_admin";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
/** Pause after a wrong username or password (slows guessing). */
export const ADMIN_MISMATCH_DELAY_MS = 400;

export interface AdminConfig {
  user: string;
  password: string;
  secret: string;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

const isConfigured = (cfg: AdminConfig) => !!cfg.user && !!cfg.password && !!cfg.secret;

/**
 * True only when both the username and the password match. Compares sha256
 * digests in constant time and checks both, so the answer takes the same
 * time whichever part is wrong. Empty configured values never match.
 */
export function credentialsMatch(cfg: AdminConfig, user: string, password: string): boolean {
  const userOk = timingSafeEqual(sha256(String(user ?? "")), sha256(cfg.user ?? ""));
  const passwordOk = timingSafeEqual(sha256(String(password ?? "")), sha256(cfg.password ?? ""));
  return !!cfg.user && !!cfg.password && userOk && passwordOk;
}

function signingKey(cfg: AdminConfig): Buffer {
  return sha256(`tymo-admin:${cfg.secret}:${cfg.user}:${cfg.password}`);
}

function mac(cfg: AdminConfig, payload: string): Buffer {
  return createHmac("sha256", signingKey(cfg)).update(payload, "utf8").digest();
}

/** A signed session token for cfg.user, valid for ADMIN_SESSION_TTL_MS. */
export function signAdminSession(cfg: AdminConfig, now: Date = new Date()): { token: string; expiresAt: Date } {
  if (!isConfigured(cfg)) throw new Error("Admin sign-in is not configured");
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS);
  const payload = `${Buffer.from(cfg.user, "utf8").toString("base64url")}.${expiresAt.getTime()}`;
  return { token: `${payload}.${mac(cfg, payload).toString("base64url")}`, expiresAt };
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** The admin a token was signed for, or null when it is malformed, tampered with, expired or signed under other settings. */
export function verifyAdminSession(cfg: AdminConfig, token: string, now: Date = new Date()): { user: string } | null {
  if (!isConfigured(cfg) || typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userPart, expiresPart, sigPart] = parts;
  if (!B64URL.test(userPart) || !/^\d{1,15}$/.test(expiresPart) || !B64URL.test(sigPart)) return null;

  // Compare the encoded strings so only the one canonical signature passes.
  const given = Buffer.from(sigPart, "utf8");
  const expected = Buffer.from(mac(cfg, `${userPart}.${expiresPart}`).toString("base64url"), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  if (Number(expiresPart) <= now.getTime()) return null;
  const user = Buffer.from(userPart, "base64url").toString("utf8");
  if (user !== cfg.user) return null;
  return { user };
}

/** httpOnly, lax, scoped to /admin; secure in production. */
export function adminCookieOptions(isProd: boolean, expires: Date) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/admin",
    expires,
  };
}
