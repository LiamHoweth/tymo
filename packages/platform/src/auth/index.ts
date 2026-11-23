import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { StaffContext, StaffRole } from "@tymo/shared/types";
import { env } from "@tymo/shared/env";
import { withSystem, type Tx } from "@tymo/db";
import { magicLinks, staffSessions, tenants, users } from "@tymo/db/schema";
import { notify } from "@tymo/platform/email/notify";
import {
  SESSION_COOKIE,
  checkMagicLink,
  generateToken,
  hashToken,
  looksLikeToken,
  magicLinkExpiry,
  normalizeEmail,
  sessionCookieOptions,
  sessionExpiry,
} from "./tokens";

/**
 * Staff authentication: emailed magic links (15 minutes, single use) and
 * an httpOnly session cookie (30 days). Owned by the auth module.
 * Only sha256 hashes of link and session tokens are stored.
 */
export interface StaffSession extends StaffContext {
  email: string;
  name: string;
  role: StaffRole;
  tenantSlug: string;
  tenantName: string;
}

/** The signed-in staff member, or null. Cached per request. */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !looksLikeToken(token)) return null;
  const [row] = await withSystem((tx) =>
    tx
      .select({
        tenantId: staffSessions.tenantId,
        userId: users.id,
        role: users.role,
        email: users.email,
        name: users.name,
        tenantSlug: tenants.slug,
        tenantName: tenants.name,
      })
      .from(staffSessions)
      .innerJoin(users, and(eq(users.id, staffSessions.userId), eq(users.tenantId, staffSessions.tenantId)))
      .innerJoin(tenants, eq(tenants.id, staffSessions.tenantId))
      .where(and(eq(staffSessions.tokenHash, hashToken(token)), gt(staffSessions.expiresAt, new Date())))
      .limit(1),
  );
  return row ?? null;
});

/** Redirects to /staff/login when signed out. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");
  return session;
}

/** Like requireStaff, but redirects staff (non-owners) to /staff with a notice. */
export async function requireOwner(): Promise<StaffSession> {
  const session = await requireStaff();
  if (session.role !== "owner") redirect("/staff?notice=owner-only");
  return session;
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function requestMagicLink(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  let members: { id: string; tenantId: string }[] = [];
  try {
    members = await withSystem((tx) =>
      tx.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.email, normalized)),
    );
  } catch (err) {
    console.error("[auth] magic link lookup failed", err);
    return;
  }
  // One link per membership; v1 normally has exactly one.
  for (const member of members) {
    try {
      const url = await withSystem((tx) => insertMagicLink(tx, member.id, member.tenantId));
      await notify(member.tenantId, { kind: "staff_sign_in", userId: member.id, url });
    } catch (err) {
      console.error("[auth] could not send a magic link", err);
    }
  }
}

/** Verifies the token, creates a session and sets the cookie. */
export async function consumeMagicLink(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "used" }> {
  if (!looksLikeToken(token)) return { ok: false, reason: "invalid" };
  const now = new Date();
  const result = await withSystem(async (tx) => {
    const [link] = await tx.select().from(magicLinks).where(eq(magicLinks.tokenHash, hashToken(token))).limit(1);
    const check = checkMagicLink(link, now);
    if (check !== "ok") return { ok: false as const, reason: check };
    // Single use: only the request that flips used_at gets a session.
    const claimed = await tx
      .update(magicLinks)
      .set({ usedAt: now })
      .where(and(eq(magicLinks.id, link.id), isNull(magicLinks.usedAt)))
      .returning({ id: magicLinks.id });
    if (claimed.length === 0) return { ok: false as const, reason: "used" as const };
    const sessionToken = generateToken();
    const expiresAt = sessionExpiry(now);
    await tx.insert(staffSessions).values({
      userId: link.userId,
      tenantId: link.tenantId,
      tokenHash: hashToken(sessionToken),
      expiresAt,
    });
    return { ok: true as const, sessionToken, expiresAt };
  });
  if (!result.ok) return result;
  (await cookies()).set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(env.isProd, result.expiresAt));
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && looksLikeToken(token)) {
    try {
      await withSystem((tx) => tx.delete(staffSessions).where(eq(staffSessions.tokenHash, hashToken(token))));
    } catch (err) {
      console.error("[auth] could not delete the session row", err);
    }
  }
  store.delete(SESSION_COOKIE);
}

/** Mint a sign-in URL for a user (used by invites and the dev seed). */
export async function createMagicLinkUrl(userId: string): Promise<string> {
  return withSystem(async (tx) => {
    const [user] = await tx.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error(`user ${userId} not found`);
    return insertMagicLink(tx, user.id, user.tenantId);
  });
}

async function insertMagicLink(tx: Tx, userId: string, tenantId: string): Promise<string> {
  const token = generateToken();
  await tx.insert(magicLinks).values({ userId, tenantId, tokenHash: hashToken(token), expiresAt: magicLinkExpiry() });
  return `${env.companyServicesUrl}/staff/auth/${token}`;
}
