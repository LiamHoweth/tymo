import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign-in helpers for the website requests admin page. Pure (no HTTP, no
 * database) so they are unit tested directly. They follow the booking admin
 * console's rules in packages/platform/src/auth/admin.ts.
 *
 * A session token is `${base64url(user)}.${expiresAtMs}.${hmac}`. The HMAC
 * covers the first two parts and is keyed by sha256 of the secret, user and
 * password, so changing the admin password or SESSION_SECRET signs everyone
 * out. Nothing is stored server-side.
 */

export const ADMIN_COOKIE = "tymo_admin";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Pause after a wrong username or password (slows guessing). */
export const ADMIN_MISMATCH_DELAY_MS = 400;

// Development only. The repository is public, so production never falls back to these.
const devUser = "admin1";
const devPassword = "admin1";
const devSecret = "tymo-web-dev-only-session-secret";
const base64url = /^[A-Za-z0-9_-]+$/;

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest();

/**
 * Admin settings from the environment. Outside production, unset values
 * default to admin1 / admin1 and a fixed development secret. In production
 * sign-in is off unless TYMO_ADMIN_USER, TYMO_ADMIN_PASSWORD and
 * SESSION_SECRET are all set.
 */
export function adminConfigFromEnv(env = process.env) {
  const production = env.NODE_ENV === "production";
  const user = env.TYMO_ADMIN_USER?.trim() || (production ? "" : devUser);
  const password = env.TYMO_ADMIN_PASSWORD || (production ? "" : devPassword);
  const secret = env.SESSION_SECRET || (production ? "" : devSecret);
  return { user, password, secret, enabled: Boolean(user && password && secret) };
}

const isConfigured = (config) => Boolean(config?.user && config.password && config.secret);

/**
 * True only when both the username and the password match. Compares sha256
 * digests in constant time and checks both, so the answer takes the same time
 * whichever part is wrong. Empty configured values never match.
 */
export function credentialsMatch(config, user, password) {
  const userOk = timingSafeEqual(sha256(String(user ?? "")), sha256(config.user ?? ""));
  const passwordOk = timingSafeEqual(sha256(String(password ?? "")), sha256(config.password ?? ""));
  return isConfigured(config) && userOk && passwordOk;
}

function signature(config, payload) {
  const key = sha256(`tymo-admin:${config.secret}:${config.user}:${config.password}`);
  return createHmac("sha256", key).update(payload, "utf8").digest("base64url");
}

/** A signed session token for config.user, valid for ADMIN_SESSION_TTL_MS. */
export function signAdminSession(config, now = Date.now()) {
  if (!isConfigured(config)) throw new Error("Admin sign-in is not configured");
  const expiresAt = now + ADMIN_SESSION_TTL_MS;
  const payload = `${Buffer.from(config.user, "utf8").toString("base64url")}.${expiresAt}`;
  return { token: `${payload}.${signature(config, payload)}`, expiresAt };
}

/** The admin a token was signed for, or null when it is malformed, tampered with, expired or signed under other settings. */
export function verifyAdminSession(config, token, now = Date.now()) {
  if (!isConfigured(config) || typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userPart, expiresPart, signaturePart] = parts;
  if (!base64url.test(userPart) || !/^\d{1,15}$/.test(expiresPart) || !base64url.test(signaturePart)) return null;

  // Compare the encoded strings so only the one canonical signature passes.
  const given = Buffer.from(signaturePart, "utf8");
  const expected = Buffer.from(signature(config, `${userPart}.${expiresPart}`), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  if (Number(expiresPart) <= now) return null;
  const user = Buffer.from(userPart, "base64url").toString("utf8");
  return user === config.user ? { user } : null;
}

/** One cookie's value from a Cookie request header, or null. */
export function readCookie(header, name) {
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** Set-Cookie value for a session token: HttpOnly, Lax, scoped to /admin, Secure behind HTTPS. */
export function sessionCookie(token, expiresAt, secure, now = Date.now()) {
  const maxAge = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return [
    `${ADMIN_COOKIE}=${token}`,
    `Max-Age=${maxAge}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Set-Cookie value that removes the session cookie. */
export function clearedSessionCookie(secure) {
  return [
    `${ADMIN_COOKIE}=`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Path=/admin",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
