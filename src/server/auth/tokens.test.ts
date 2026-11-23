import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAuthorizedBearer } from "./cron";
import {
  MAGIC_LINK_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  checkMagicLink,
  generateToken,
  hashToken,
  looksLikeToken,
  magicLinkExpiry,
  normalizeEmail,
  sessionCookieOptions,
  sessionExpiry,
} from "./tokens";

describe("tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(looksLikeToken(a)).toBe(true);
  });

  it("are stored only as a sha256 hex hash", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash); // deterministic
  });

  it("rejects malformed tokens before any lookup", () => {
    expect(looksLikeToken("")).toBe(false);
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("x".repeat(44))).toBe(false);
    expect(looksLikeToken("a".repeat(42) + "=")).toBe(false);
    expect(looksLikeToken("../../etc/passwd/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });
});

describe("magic links", () => {
  const now = new Date("2026-11-22T20:00:00Z");

  it("expire 15 minutes after creation", () => {
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
    expect(magicLinkExpiry(now).toISOString()).toBe("2026-11-22T20:15:00.000Z");
  });

  it("are ok until the expiry instant, then expired", () => {
    const link = { expiresAt: magicLinkExpiry(now), usedAt: null };
    expect(checkMagicLink(link, now)).toBe("ok");
    expect(checkMagicLink(link, new Date("2026-11-22T20:14:59Z"))).toBe("ok");
    expect(checkMagicLink(link, new Date("2026-11-22T20:15:00Z"))).toBe("expired");
    expect(checkMagicLink(link, new Date("2026-11-23T00:00:00Z"))).toBe("expired");
  });

  it("work once", () => {
    expect(checkMagicLink({ expiresAt: magicLinkExpiry(now), usedAt: now }, now)).toBe("used");
    // Used and expired reads as used.
    expect(checkMagicLink({ expiresAt: now, usedAt: now }, new Date("2026-11-23T00:00:00Z"))).toBe("used");
  });

  it("unknown tokens are invalid", () => {
    expect(checkMagicLink(undefined, now)).toBe("invalid");
    expect(checkMagicLink(null, now)).toBe("invalid");
  });
});

describe("sessions", () => {
  it("last 30 days", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 3600 * 1000);
    expect(sessionExpiry(new Date("2026-11-22T20:00:00Z")).toISOString()).toBe("2026-12-22T20:00:00.000Z");
  });

  it("cookie is httpOnly, lax, path /, secure only in production", () => {
    const expires = new Date("2026-12-22T20:00:00Z");
    expect(SESSION_COOKIE).toBe("tymo_session");
    expect(sessionCookieOptions(true, expires)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
    expect(sessionCookieOptions(false, expires).secure).toBe(false);
  });
});

describe("emails", () => {
  it("are trimmed and lower-cased", () => {
    expect(normalizeEmail("  Pat@Redbud.Example ")).toBe("pat@redbud.example");
  });
  it("reject junk", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a b@c.d")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@b.co`)).toBeNull();
  });
});

describe("cron bearer check", () => {
  it("accepts exactly Bearer <secret>", () => {
    expect(isAuthorizedBearer("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedBearer("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedBearer("bearer s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedBearer("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedBearer(null, "s3cret")).toBe(false);
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
  });
});
