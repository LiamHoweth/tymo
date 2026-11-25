import { describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_MS,
  adminCookieOptions,
  credentialsMatch,
  signAdminSession,
  verifyAdminSession,
  type AdminConfig,
} from "./admin";

const cfg: AdminConfig = { user: "admin1", password: "correct horse", secret: "test-secret" };
const now = new Date("2026-11-24T20:00:00Z");

describe("admin credentials", () => {
  it("match only when both the username and the password match", () => {
    expect(credentialsMatch(cfg, "admin1", "correct horse")).toBe(true);
    expect(credentialsMatch(cfg, "admin1", "wrong")).toBe(false);
    expect(credentialsMatch(cfg, "admin2", "correct horse")).toBe(false);
    expect(credentialsMatch(cfg, "Admin1", "correct horse")).toBe(false);
    expect(credentialsMatch(cfg, "admin1", "correct horse ")).toBe(false);
    expect(credentialsMatch(cfg, "", "")).toBe(false);
  });

  it("never match an empty configured username or password", () => {
    expect(credentialsMatch({ ...cfg, user: "" }, "", "correct horse")).toBe(false);
    expect(credentialsMatch({ ...cfg, password: "" }, "admin1", "")).toBe(false);
    expect(credentialsMatch({ user: "", password: "", secret: "" }, "", "")).toBe(false);
  });
});

describe("admin sessions", () => {
  it("round-trip: a signed token verifies as the configured user for 12 hours", () => {
    expect(ADMIN_SESSION_TTL_MS).toBe(12 * 3600 * 1000);
    const { token, expiresAt } = signAdminSession(cfg, now);
    expect(expiresAt.toISOString()).toBe("2026-11-25T08:00:00.000Z");
    expect(token.split(".")).toHaveLength(3);
    expect(token).not.toContain(cfg.password);
    expect(token).not.toContain(cfg.secret);
    expect(verifyAdminSession(cfg, token, now)).toEqual({ user: "admin1" });
    expect(verifyAdminSession(cfg, token, new Date(expiresAt.getTime() - 1))).toEqual({ user: "admin1" });
  });

  it("expire at the expiry instant", () => {
    const { token, expiresAt } = signAdminSession(cfg, now);
    expect(verifyAdminSession(cfg, token, expiresAt)).toBeNull();
    expect(verifyAdminSession(cfg, token, new Date("2026-12-01T00:00:00Z"))).toBeNull();
  });

  it("reject a tampered signature or expiry", () => {
    const { token } = signAdminSession(cfg, now);
    const [user, exp, sig] = token.split(".");
    const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyAdminSession(cfg, `${user}.${exp}.${flipped}`, now)).toBeNull();
    expect(verifyAdminSession(cfg, `${user}.${exp}.${sig}x`, now)).toBeNull();
    expect(verifyAdminSession(cfg, `${user}.${exp}.${sig.slice(0, -1)}`, now)).toBeNull();
    expect(verifyAdminSession(cfg, `${user}.${Number(exp) + 3_600_000}.${sig}`, now)).toBeNull();
  });

  it("reject a tampered user", () => {
    const { token } = signAdminSession(cfg, now);
    const [, exp, sig] = token.split(".");
    const other = Buffer.from("admin2").toString("base64url");
    expect(verifyAdminSession(cfg, `${other}.${exp}.${sig}`, now)).toBeNull();
  });

  it("reject a token signed for a user who is no longer the admin", () => {
    const { token } = signAdminSession({ ...cfg, user: "former" }, now);
    expect(verifyAdminSession(cfg, token, now)).toBeNull();
  });

  it("stop working after the password changes", () => {
    const { token } = signAdminSession(cfg, now);
    expect(verifyAdminSession({ ...cfg, password: "new password" }, token, now)).toBeNull();
  });

  it("stop working after the secret changes", () => {
    const { token } = signAdminSession(cfg, now);
    expect(verifyAdminSession({ ...cfg, secret: "rotated-secret" }, token, now)).toBeNull();
  });

  it("reject malformed strings", () => {
    for (const bad of [
      "",
      "garbage",
      "a.b",
      "a.b.c.d",
      "YWRtaW4x..sig",
      "YWRtaW4x.notanumber.sig",
      "YWRtaW4x.-5.sig",
      "YWRtaW4x.1e20.sig",
      "YW Rt.1798000000000.sig",
      "YWRtaW4x.1798000000000.sig=",
      "../../etc/passwd",
      "x".repeat(5000),
    ]) {
      expect(verifyAdminSession(cfg, bad, now)).toBeNull();
    }
    expect(verifyAdminSession(cfg, undefined as unknown as string, now)).toBeNull();
  });

  it("never verify or sign under an incomplete configuration", () => {
    const { token } = signAdminSession(cfg, now);
    expect(verifyAdminSession({ ...cfg, secret: "" }, token, now)).toBeNull();
    expect(verifyAdminSession({ ...cfg, user: "" }, token, now)).toBeNull();
    expect(() => signAdminSession({ ...cfg, password: "" }, now)).toThrow();
  });

  it("cookie is httpOnly, lax, scoped to /admin, secure only in production", () => {
    const expires = new Date("2026-11-25T08:00:00Z");
    expect(ADMIN_COOKIE).toBe("tymo_admin");
    expect(adminCookieOptions(true, expires)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/admin", expires });
    expect(adminCookieOptions(false, expires).secure).toBe(false);
  });
});
