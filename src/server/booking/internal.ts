import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import type { CustomerStatusLabel, FacilityPublic } from "@/lib/types";
import { withSystem, type Tx } from "@/server/db";
import { bookings, tenants, unitOccupancy } from "@/server/db/schema";
import { notify, type NotifyEvent } from "@/server/email/notify";
import { getPaymentProvider } from "@/server/payments";
import { writeAudit } from "./core/audit";
import type { TenantRow } from "./core/availability";
import { zoneLabel } from "./core/time";

export type BookingRow = typeof bookings.$inferSelect;
export type { TenantRow };

/** Tenant by URL slug (no RLS on tenants). */
export async function tenantBySlug(slug: string): Promise<TenantRow | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,64}$/i.test(slug)) return null;
  return withSystem(async (tx) => {
    const [t] = await tx.select().from(tenants).where(eq(tenants.slug, slug.toLowerCase())).limit(1);
    return t ?? null;
  });
}

export async function tenantById(tx: Tx, tenantId: string): Promise<TenantRow> {
  const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw new Error("Tenant not found");
  return t;
}

export function toFacilityPublic(t: TenantRow, now: Date = new Date()): FacilityPublic {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    city: t.city,
    address: t.address,
    contactPhone: t.contactPhone,
    contactEmail: t.contactEmail,
    timeZone: t.timeZone,
    timeZoneLabel: zoneLabel(t.timeZone, now),
    brand: { primary: t.brandPrimary, accent: t.brandAccent, logoUrl: t.logoUrl },
    waiverText: t.waiverText,
    waiverVersion: t.waiverVersion,
    cancellationPolicyText: t.cancellationPolicyText,
    cancelCutoffMinutes: t.cancelCutoffMinutes,
    bookingWindowDays: t.bookingWindowDays,
    leadTimeMinutes: t.leadTimeMinutes,
    checkoutHoldMinutes: t.checkoutHoldMinutes,
    bookingsEnabled: t.bookingsEnabled,
    payments: {
      mode: env.paymentsMode,
      stripeAccountId: t.stripeAccountId,
      publishableKey: env.stripePublishableKey || null,
    },
  };
}

/** Customer-facing status word (docs/ARCHITECTURE.md table). */
export function customerStatusLabel(status: BookingRow["status"]): CustomerStatusLabel {
  switch (status) {
    case "requested":
    case "checking_out":
      return "Requested";
    case "approved":
    case "completed":
      return "Booked";
    case "declined":
    case "payment_failed":
    case "abandoned":
      return "Not booked";
    case "expired":
      return "Expired";
    default:
      return "Cancelled";
  }
}

/** Staff-facing status word. */
export function staffStatusLabel(b: Pick<BookingRow, "status" | "paymentStatus">): string {
  if (b.paymentStatus === "refunded") return "Refunded";
  if (b.paymentStatus === "partially_refunded") return "Partly refunded";
  const labels: Record<BookingRow["status"], string> = {
    checking_out: "Checking out",
    abandoned: "Abandoned",
    requested: "Requested",
    approved: "Approved",
    declined: "Declined",
    expired: "Expired",
    payment_failed: "Payment failed",
    cancelled_by_customer: "Cancelled by customer",
    cancelled_by_facility: "Cancelled by facility",
    completed: "Completed",
  };
  return labels[b.status];
}

/** notify() runs after commit and must never break the caller. */
export async function safeNotify(tenantId: string, event: NotifyEvent): Promise<void> {
  try {
    await notify(tenantId, event);
  } catch (err) {
    console.warn(`[booking] notify(${event.kind}) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Release a card hold after commit; failures are logged (the hold lapses on its own). */
export async function cancelPaymentQuietly(
  stripeAccountId: string | null,
  paymentIntentId: string | null,
  bookingId: string,
): Promise<void> {
  if (!paymentIntentId) return;
  try {
    const provider = await getPaymentProvider();
    await provider.cancel({ stripeAccountId, paymentIntentId, idempotencyKey: `cancel-${bookingId}` });
  } catch (err) {
    console.warn(`[booking] cancel payment for ${bookingId} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fake payments only: the fake keeps intents in memory, so seeded or
 * pre-restart payments are unknown to it and would refuse a refund. Capturing
 * with the booking's capture key first is a no-op for intents it knows.
 */
export async function ensureFakeCaptured(
  stripeAccountId: string | null,
  paymentIntentId: string,
  bookingId: string,
): Promise<void> {
  const provider = await getPaymentProvider();
  if (provider.mode !== "fake") return;
  await provider
    .capture({ stripeAccountId, paymentIntentId, idempotencyKey: `capture-${bookingId}` })
    .catch(() => undefined);
}

export async function lockBooking(tx: Tx, tenantId: string, bookingId: string): Promise<BookingRow | null> {
  const [b] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
    .for("update")
    .limit(1);
  return b ?? null;
}

export async function deleteOccupancy(tx: Tx, tenantId: string, bookingId: string): Promise<void> {
  await tx.delete(unitOccupancy).where(and(eq(unitOccupancy.tenantId, tenantId), eq(unitOccupancy.bookingId, bookingId)));
}

export async function liveHoldCount(tx: Tx, tenantId: string, bookingId: string, now: Date): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(unitOccupancy)
    .where(
      and(
        eq(unitOccupancy.tenantId, tenantId),
        eq(unitOccupancy.bookingId, bookingId),
        eq(unitOccupancy.kind, "hold"),
        sql`${unitOccupancy.holdExpiresAt} > ${now.toISOString()}::timestamptz`,
      ),
    );
  return Number(row?.n ?? 0);
}

/** Bump version and updated_at on every state change. */
export const bump = (now: Date) => ({ updatedAt: now, version: sql`${bookings.version} + 1` });

/**
 * Abandon checkouts whose 10-minute hold has passed (optionally only those
 * holding the given units): delete their rows, mark them abandoned and
 * return payments to cancel after commit.
 */
export async function abandonExpiredCheckouts(
  tx: Tx,
  tenantId: string,
  now: Date,
  unitIds?: string[],
): Promise<{ bookingId: string; paymentIntentId: string | null }[]> {
  let ids: string[];
  if (unitIds) {
    if (!unitIds.length) return [];
    const rows = await tx
      .selectDistinct({ id: unitOccupancy.bookingId })
      .from(unitOccupancy)
      .where(
        and(
          eq(unitOccupancy.tenantId, tenantId),
          eq(unitOccupancy.kind, "hold"),
          inArray(unitOccupancy.unitId, unitIds),
          lte(unitOccupancy.holdExpiresAt, now),
        ),
      );
    ids = rows.map((r) => r.id).filter((id): id is string => !!id);
  } else {
    const rows = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.status, "checking_out"), lte(bookings.checkoutExpiresAt, now)));
    const orphan = await tx
      .selectDistinct({ id: unitOccupancy.bookingId })
      .from(unitOccupancy)
      .where(and(eq(unitOccupancy.tenantId, tenantId), eq(unitOccupancy.kind, "hold"), lte(unitOccupancy.holdExpiresAt, now)));
    ids = [...new Set([...rows.map((r) => r.id), ...orphan.map((r) => r.id).filter((id): id is string => !!id)])];
  }
  if (!ids.length) return [];
  await tx
    .delete(unitOccupancy)
    .where(and(eq(unitOccupancy.tenantId, tenantId), eq(unitOccupancy.kind, "hold"), inArray(unitOccupancy.bookingId, ids)));
  const released = await tx
    .update(bookings)
    .set({
      status: "abandoned",
      paymentStatus: sql`case when ${bookings.paymentIntentId} is null then ${bookings.paymentStatus} else 'canceled'::payment_status end`,
      checkoutExpiresAt: null,
      ...bump(now),
    })
    .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.id, ids), eq(bookings.status, "checking_out")))
    .returning({ id: bookings.id, paymentIntentId: bookings.paymentIntentId });
  for (const b of released) {
    await writeAudit(tx, {
      tenantId,
      actorType: "system",
      action: "booking.abandon",
      targetType: "booking",
      targetId: b.id,
      reason: "Checkout hold timed out",
      at: now,
    });
  }
  return released.map((b) => ({ bookingId: b.id, paymentIntentId: b.paymentIntentId }));
}

/**
 * Move a requested booking to expired inside tx (rows deleted, payment
 * marked canceled). The caller cancels the hold and notifies after commit.
 */
export async function markExpired(tx: Tx, b: BookingRow, now: Date): Promise<void> {
  await deleteOccupancy(tx, b.tenantId, b.id);
  await tx
    .update(bookings)
    .set({ status: "expired", paymentStatus: b.paymentIntentId ? "canceled" : b.paymentStatus, ...bump(now) })
    .where(eq(bookings.id, b.id));
  await writeAudit(tx, {
    tenantId: b.tenantId,
    actorType: "system",
    action: "booking.expire",
    targetType: "booking",
    targetId: b.id,
    reason: "No decision before the approval deadline",
    at: now,
  });
}
