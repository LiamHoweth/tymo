import "server-only";
import type { StaffContext, StaffRole } from "@/lib/types";
import { notImplemented } from "@/server/not-implemented";

/**
 * Staff authentication: emailed magic links (15 minutes, single use) and
 * an httpOnly session cookie (30 days). Owned by the auth module.
 */
export interface StaffSession extends StaffContext {
  email: string;
  name: string;
  role: StaffRole;
  tenantSlug: string;
  tenantName: string;
}

export async function getStaffSession(): Promise<StaffSession | null> {
  return notImplemented("getStaffSession");
}

/** Redirects to /staff/login when signed out. */
export async function requireStaff(): Promise<StaffSession> {
  return notImplemented("requireStaff");
}

/** Like requireStaff, but redirects staff (non-owners) to /staff with a notice. */
export async function requireOwner(): Promise<StaffSession> {
  return notImplemented("requireOwner");
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function requestMagicLink(email: string): Promise<void> {
  return notImplemented("requestMagicLink", email);
}

/** Verifies the token, creates a session and sets the cookie. */
export async function consumeMagicLink(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "used" }> {
  return notImplemented("consumeMagicLink", token);
}

export async function signOut(): Promise<void> {
  return notImplemented("signOut");
}

/** Mint a sign-in URL for a user (used by invites and the dev seed). */
export async function createMagicLinkUrl(userId: string): Promise<string> {
  return notImplemented("createMagicLinkUrl", userId);
}
