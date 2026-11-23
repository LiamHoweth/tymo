import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { CheckoutHold } from "@/lib/types";
import { env } from "@/lib/env";

/**
 * Checkout state the UI needs between steps.
 *
 * The engine's public API returns the hold only from startCheckout and has
 * no getter for a checkout (hold summary + saved details). Until it does,
 * the UI keeps two small cookies, encrypted with AES-256-GCM and httpOnly so
 * page scripts can't read them:
 *
 *  - one per checkout token: the hold summary (field, times, price, expiry)
 *    and, after Send, the private booking token so Back can say "already sent";
 *  - one per facility: the renter's typed details, so Back never loses them
 *    and "we kept your details" stays true after a hold runs out.
 *
 * Card data is never stored. The engine stays the source of truth for price,
 * hold and details; these cookies only drive what the pages display.
 * Replace readCheckout() with an engine getter once one exists.
 */

export interface CheckoutState {
  token: string;
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  priceCents: number;
  whenLabel: string;
  /** Facility-local date and duration, to return to the same Date and time view. */
  date: string;
  durationMinutes: number;
  waiverAccepted?: boolean;
  sentPublicToken?: string;
}

export interface KeptDetails {
  name: string;
  email: string;
  phone: string;
  team: string;
}

const key = createHash("sha256").update(`tymo-checkout:${env.sessionSecret}`).digest();

function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function open<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const checkoutCookie = (token: string) => `tymo_co_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
const DETAILS_COOKIE = "tymo_details";
const base = (slug: string) => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax" as const,
  path: `/book/${slug}`,
});

export async function readCheckout(token: string): Promise<CheckoutState | null> {
  const state = open<CheckoutState>((await cookies()).get(checkoutCookie(token))?.value);
  return state && state.token === token ? state : null;
}

export async function writeCheckout(slug: string, state: CheckoutState): Promise<void> {
  // Outlive the hold so a late Send still shows "ran out" / "already sent".
  (await cookies()).set(checkoutCookie(state.token), seal(state), { ...base(slug), maxAge: 60 * 60 * 6 });
}

export async function updateCheckout(slug: string, token: string, patch: Partial<CheckoutState>): Promise<void> {
  const current = await readCheckout(token);
  if (current) await writeCheckout(slug, { ...current, ...patch });
}

export async function clearCheckout(slug: string, token: string): Promise<void> {
  (await cookies()).set(checkoutCookie(token), "", { ...base(slug), maxAge: 0 });
}

export function checkoutFromHold(hold: CheckoutHold, date: string, durationMinutes: number): CheckoutState {
  return {
    token: hold.checkoutToken,
    resourceId: hold.resourceId,
    resourceName: hold.resourceName,
    startsAt: hold.startsAt,
    endsAt: hold.endsAt,
    expiresAt: hold.expiresAt,
    priceCents: hold.priceCents,
    whenLabel: hold.whenLabel,
    date,
    durationMinutes,
  };
}

export async function readDetails(): Promise<KeptDetails | null> {
  return open<KeptDetails>((await cookies()).get(DETAILS_COOKIE)?.value);
}

export async function writeDetails(slug: string, details: KeptDetails): Promise<void> {
  // Two hours: long enough to finish or retry, short enough for a shared computer.
  (await cookies()).set(DETAILS_COOKIE, seal(details), { ...base(slug), maxAge: 60 * 60 * 2 });
}
