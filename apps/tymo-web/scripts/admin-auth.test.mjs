import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_SESSION_TTL_MS,
  adminConfigFromEnv,
  clearedSessionCookie,
  credentialsMatch,
  readCookie,
  sessionCookie,
  signAdminSession,
  verifyAdminSession,
} from "./admin-auth.mjs";

const config = { user: "operator", password: "correct horse battery", secret: "test-only-secret", enabled: true };
const now = Date.UTC(2026, 10, 24, 20, 0);

test("defaults to admin1 only outside production and turns sign-in off when production is missing a value", () => {
  const development = adminConfigFromEnv({});
  assert.equal(development.user, "admin1");
  assert.equal(development.password, "admin1");
  assert.ok(development.secret);
  assert.equal(development.enabled, true);

  for (const missing of ["TYMO_ADMIN_USER", "TYMO_ADMIN_PASSWORD", "SESSION_SECRET"]) {
    const env = { NODE_ENV: "production", TYMO_ADMIN_USER: "operator", TYMO_ADMIN_PASSWORD: "pw", SESSION_SECRET: "s" };
    delete env[missing];
    const production = adminConfigFromEnv(env);
    assert.equal(production.enabled, false, `${missing} unset`);
    assert.notEqual(production.user, "admin1");
    assert.notEqual(production.password, "admin1");
  }

  const configured = adminConfigFromEnv({
    NODE_ENV: "production", TYMO_ADMIN_USER: "  operator ", TYMO_ADMIN_PASSWORD: " pw ", SESSION_SECRET: "s",
  });
  assert.deepEqual(configured, { user: "operator", password: " pw ", secret: "s", enabled: true });
});

test("matches credentials only when both parts are right", () => {
  assert.equal(credentialsMatch(config, "operator", "correct horse battery"), true);
  assert.equal(credentialsMatch(config, "operator", "wrong"), false);
  assert.equal(credentialsMatch(config, "someone", "correct horse battery"), false);
  assert.equal(credentialsMatch(config, "operator", "correct horse battery "), false);
  assert.equal(credentialsMatch({ user: "", password: "", secret: "" }, "", ""), false);
});

test("round-trips a session and rejects tampered, malformed and expired tokens", () => {
  const { token, expiresAt } = signAdminSession(config, now);
  assert.equal(expiresAt, now + ADMIN_SESSION_TTL_MS);
  assert.deepEqual(verifyAdminSession(config, token, now), { user: "operator" });
  assert.deepEqual(verifyAdminSession(config, token, expiresAt - 1), { user: "operator" });
  assert.equal(verifyAdminSession(config, token, expiresAt), null);

  const [userPart, expiresPart, signature] = token.split(".");
  const flipped = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(verifyAdminSession(config, `${userPart}.${expiresPart}.${flipped}`, now), null);  assert.equal(verifyAdminSession(config, `${userPart}.${Number(expiresPart) + 60_000}.${signature}`, now), null);
  const otherUser = Buffer.from("intruder").toString("base64url");
  assert.equal(verifyAdminSession(config, `${otherUser}.${expiresPart}.${signature}`, now), null);
  for (const malformed of ["", "abc", `${userPart}.${expiresPart}`, `${token}.extra`, `${userPart}.soon.${signature}`, "x".repeat(2000)]) {
    assert.equal(verifyAdminSession(config, malformed, now), null);
  }
  assert.equal(verifyAdminSession(config, undefined, now), null);
});

test("signs everyone out when the password, secret or username changes", () => {
  const { token } = signAdminSession(config, now);
  assert.equal(verifyAdminSession({ ...config, password: "new password" }, token, now), null);
  assert.equal(verifyAdminSession({ ...config, secret: "rotated" }, token, now), null);
  assert.equal(verifyAdminSession({ ...config, user: "someone" }, token, now), null);
  assert.equal(verifyAdminSession({ ...config, secret: "" }, token, now), null);
  assert.throws(() => signAdminSession({ ...config, password: "" }, now));
});

test("builds and reads the session cookie", () => {
  const { token, expiresAt } = signAdminSession(config, now);
  const cookie = sessionCookie(token, expiresAt, false, now);
  assert.match(cookie, new RegExp(`^tymo_admin=${token.replace(/[.]/g, "\\.")}; `));
  assert.match(cookie, /; Max-Age=43200; /);
  assert.match(cookie, /; Path=\/admin; HttpOnly; SameSite=Lax$/);
  assert.match(sessionCookie(token, expiresAt, true, now), /; SameSite=Lax; Secure$/);
  assert.match(clearedSessionCookie(false), /^tymo_admin=; Max-Age=0; .*Path=\/admin; HttpOnly; SameSite=Lax$/);
  assert.match(clearedSessionCookie(true), /; Secure$/);

  assert.equal(readCookie(`theme=dark; tymo_admin=${token}; other=1`, "tymo_admin"), token);
  assert.equal(readCookie("not_tymo_admin=1", "tymo_admin"), null);
  assert.equal(readCookie(undefined, "tymo_admin"), null);
});
