import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@tymo/shared/env";
import {
  ADMIN_COOKIE,
  ADMIN_MISMATCH_DELAY_MS,
  adminCookieOptions,
  credentialsMatch,
  signAdminSession,
  verifyAdminSession,
  type AdminConfig,
} from "./admin";

/**
 * Tymo admin console sign-in (tymo services /admin): one username and
 * password from TYMO_ADMIN_USER / TYMO_ADMIN_PASSWORD (development
 * defaults admin1 / admin1), and a signed httpOnly cookie on /admin.
 */

export interface AdminSession {
  user: string;
}

function adminConfig(): AdminConfig {
  return { user: env.adminUser, password: env.adminPassword, secret: env.sessionSecret };
}

/** "off" in production when TYMO_ADMIN_USER, TYMO_ADMIN_PASSWORD or SESSION_SECRET is unset. */
export function adminSignInStatus(): "ready" | "off" {
  if (!env.adminUser || !env.adminPassword) return "off";
  if (env.isProd && !env.sessionSecretSet) return "off";
  return "ready";
}

const readAdminSession = cache(async (): Promise<AdminSession | null> => {
  if (adminSignInStatus() === "off") return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(adminConfig(), token);
});

/** The signed-in admin, or null. Cached per request. */
export async function getAdminSession(): Promise<AdminSession | null> {
  return readAdminSession();
}

/** Redirects to /admin/login when signed out. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Checks the credentials (constant time) and sets the cookie on a match. */
export async function signInAdmin(
  user: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "mismatch" | "off" }> {
  if (adminSignInStatus() === "off") return { ok: false, reason: "off" };
  const cfg = adminConfig();
  // The username is trimmed; the password is taken exactly as typed.
  if (!credentialsMatch(cfg, String(user ?? "").trim(), String(password ?? ""))) {
    await new Promise((resolve) => setTimeout(resolve, ADMIN_MISMATCH_DELAY_MS));
    return { ok: false, reason: "mismatch" };
  }
  const { token, expiresAt } = signAdminSession(cfg);
  (await cookies()).set(ADMIN_COOKIE, token, adminCookieOptions(env.isProd, expiresAt));
  return { ok: true };
}

export async function signOutAdmin(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
}
