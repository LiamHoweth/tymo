import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { formatCard, formatCents, formatRate } from "@/lib/format";
import type {
  ApprovalQueueItem,
  BlockConflict,
  BlockInput,
  BlockListItem,
  BlockPreview,
  CalendarDay,
  CalendarItem,
  CalendarRow,
  CancelBookingInput,
  CreateBlockResult,
  SettingsView,
  SetupChecklist,
  StaffActionResult,
  StaffBookingDetail,
  StaffContext,
} from "@/lib/types";
import { withTenant, type Tx } from "@/server/db";
import { auditLog, blocks, bookings, customers, operatingHours, resources, tenants, unitOccupancy, users } from "@/server/db/schema";
import { applicationFeeRefundCents, estimatedStripeFeeCents, getPaymentProvider } from "@/server/payments";
import { writeAudit } from "./core/audit";
import { loadActiveBlocks, loadHours } from "./core/availability";
import {
  blockOccurrences,
  findBlockConflicts,
  materializeBlock,
  materializeHorizon,
  releaseHoldsUnderBlock,
  type BlockRow,
  type BlockShape,
  type Occurrence,
} from "./core/blocks";
import { isEmail, isUuid, normalizeEmail } from "./core/rules";
import {
  addDays,
  atLabel,
  atLocal,
  atLocalLenient,
  dateRange,
  dt,
  durationLeftLabel,
  hhmmRangeLabel,
  isValidDate,
  isValidTime,
  localDate,
  minutesOfDay,
  queueWhenLabel,
  shortDateLabel,
  startOfLocalDate,
  timeLabel,
  timeRangeLabel,
  weekdaysLabel,
  zoneLabel,
} from "./core/time";
import { blockUnitIds, loadUnitMap, staffResourceLabel, type ResourceRow, type UnitMap } from "./core/units";
import { HOUR, isExclusionViolation, MINUTE, parseRange } from "./core/util";
import {
  bump,
  cancelPaymentQuietly,
  deleteOccupancy,
  ensureFakeCaptured,
  lockBooking,
  markExpired,
  safeNotify,
  staffStatusLabel,
  tenantById,
  toFacilityPublic,
  type BookingRow,
  type TenantRow,
} from "./internal";

/**
 * Staff booking engine API. Callers pass a StaffContext from
 * requireStaff()/requireOwner(); every function runs inside
 * withTenant(ctx.tenantId) and writes an audit_log row for each change.
 * Role rules: staff may approve, decline, block, and cancel with a FULL
 * refund. Only owners may give partial/no refunds, edit prices, hours and
 * rules, manage payouts and invite staff.
 */

const isOwner = (ctx: StaffContext) => ctx.role === "owner";
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "the customer";
const FAR_FUTURE = new Date("2100-01-01T00:00:00Z");

async function customerOf(tx: Tx, b: BookingRow) {
  if (!b.customerId) return null;
  const [c] = await tx.select().from(customers).where(eq(customers.id, b.customerId)).limit(1);
  return c ?? null;
}

async function userName(tx: Tx, tenantId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await tx
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
    .limit(1);
  return u?.name ?? null;
}

function whenText(at: Date, now: Date, zone: string): string {
  if (localDate(at, zone) === localDate(now, zone)) return `at ${timeLabel(at, zone)}`;
  return `on ${shortDateLabel(at, zone)} at ${timeLabel(at, zone)}`;
}

/** "Taylor approved this at 4:05 PM." and friends, for a booking someone already handled. */
async function alreadyHandled(tx: Tx, t: TenantRow, b: BookingRow, now: Date): Promise<StaffActionResult> {
  const who = await userName(tx, t.id, b.decidedByUserId);
  const when = b.decidedAt ? ` ${whenText(b.decidedAt, now, t.timeZone)}` : "";
  const customer = await customerOf(tx, b);
  let message: string;
  switch (b.status) {
    case "approved":
    case "completed":
      message = `${who ? firstName(who) : "Someone"} approved this${when}.`;
      break;
    case "declined":
      message = `${who ? firstName(who) : "Someone"} declined this${when}.`;
      break;
    case "expired":
      message = `This request expired${b.approvalDeadlineAt ? ` ${whenText(b.approvalDeadlineAt, now, t.timeZone)}` : ""}. The hold was released.`;
      break;
    case "payment_failed":
      message = `${firstName(customer?.name)}'s card couldn't be charged. The time is open again.`;
      break;
    case "cancelled_by_customer":
      message = `${firstName(customer?.name)} cancelled this${b.cancelledAt ? ` ${whenText(b.cancelledAt, now, t.timeZone)}` : ""}.`;
      break;
    case "cancelled_by_facility":
      message = `This booking was cancelled${b.cancelledAt ? ` ${whenText(b.cancelledAt, now, t.timeZone)}` : ""}.`;
      break;
    default:
      message = "This booking can't be changed now.";
  }
  return { ok: false, error: "already_handled", message, ...(who ? { handledBy: who } : {}) };
}

// ------------------------------------------------------------ approvals

/** Waiting requests, soonest deadline first. */
export async function getApprovalQueue(ctx: StaffContext): Promise<ApprovalQueueItem[]> {
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const map = await loadUnitMap(tx, t.id);
    const rows = await tx
      .select({ b: bookings, c: customers })
      .from(bookings)
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(and(eq(bookings.tenantId, t.id), eq(bookings.status, "requested"), gt(bookings.approvalDeadlineAt, now)))
      .orderBy(asc(bookings.approvalDeadlineAt));
    return rows.map(({ b, c }) => {
      const r = map.byId.get(b.resourceId);
      const left = b.approvalDeadlineAt!.getTime() - now.getTime();
      return {
        bookingId: b.id,
        resourceCode: r?.code ?? "",
        resourceLabel: staffResourceLabel(map, b.resourceId),
        whenLabel: queueWhenLabel(b.startsAt, b.endsAt, t.timeZone),
        startsAt: b.startsAt.toISOString(),
        customerName: c?.name ?? "",
        customerPhone: c?.phone ?? "",
        customerEmail: c?.email ?? "",
        team: b.team,
        priceCents: b.priceCents,
        cardLabel: formatCard(b.cardBrand, b.cardLast4),
        waiverAccepted: !!b.waiverAcceptedAt,
        approvalDeadlineAt: b.approvalDeadlineAt!.toISOString(),
        expiresInLabel: durationLeftLabel(left),
        urgent: left < 2 * HOUR,
      };
    });
  });
}

/** Capture the hold and move to approved (idempotent; a second tap is a no-op). */
export async function approveBooking(ctx: StaffContext, bookingId: string): Promise<StaffActionResult> {
  if (!isUuid(bookingId)) return { ok: false, error: "not_found", message: "Booking not found." };
  const now = new Date();
  const provider = await getPaymentProvider();
  type Out = { result: StaffActionResult; notifyKind?: "approved" | "payment_failed" | "expired"; cancelPi?: string | null };
  const out = await withTenant(ctx.tenantId, async (tx): Promise<Out> => {
    const t = await tenantById(tx, ctx.tenantId);
    const b = await lockBooking(tx, t.id, bookingId);
    if (!b) return { result: { ok: false, error: "not_found", message: "Booking not found." } };
    if (b.status !== "requested") return { result: await alreadyHandled(tx, t, b, now) };
    if (b.approvalDeadlineAt && b.approvalDeadlineAt <= now) {
      await markExpired(tx, b, now);
      return {
        result: { ok: false, error: "already_handled", message: "This request expired before it was approved. The hold was released." },
        notifyKind: "expired",
        cancelPi: b.paymentIntentId,
      };
    }
    const customer = await customerOf(tx, b);
    const name = firstName(customer?.name);
    const capture = b.paymentIntentId
      ? await provider
          .capture({ stripeAccountId: t.stripeAccountId, paymentIntentId: b.paymentIntentId, idempotencyKey: `capture-${b.id}` })
          .catch((err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : String(err) }))
      : ({ ok: false, reason: "No payment on this booking" } as const);
    if (!capture.ok) {
      // Payment failed has no retry: the slot reopens and the customer is told.
      await deleteOccupancy(tx, t.id, b.id);
      await tx
        .update(bookings)
        .set({ status: "payment_failed", paymentStatus: "failed", decidedAt: now, decidedByUserId: ctx.userId, ...bump(now) })
        .where(eq(bookings.id, b.id));
      await writeAudit(tx, {
        tenantId: t.id,
        actorType: "staff",
        actorId: ctx.userId,
        action: "booking.payment_failed",
        targetType: "booking",
        targetId: b.id,
        reason: capture.reason,
        at: now,
      });
      return {
        result: {
          ok: false,
          error: "capture_failed",
          message: `Couldn't charge ${name}'s card. The time is open again, and ${name} was asked to book with another card.`,
        },
        notifyKind: "payment_failed",
      };
    }
    // A positive price is never captured as 0; the fake reports 0 for intents it
    // doesn't know (seeded data, dev restarts), so fall back to the price.
    const captured = capture.amountCapturedCents > 0 ? capture.amountCapturedCents : b.priceCents;
    await tx
      .update(bookings)
      .set({
        status: "approved",
        paymentStatus: "captured",
        amountCapturedCents: captured,
        decidedAt: now,
        decidedByUserId: ctx.userId,
        ...bump(now),
      })
      .where(eq(bookings.id, b.id));
    if (!t.testBookingDoneAt) await tx.update(tenants).set({ testBookingDoneAt: now }).where(eq(tenants.id, t.id));
    await writeAudit(tx, {
      tenantId: t.id,
      actorType: "staff",
      actorId: ctx.userId,
      action: "booking.approve",
      targetType: "booking",
      targetId: b.id,
      data: { amountCents: captured },
      at: now,
    });
    return {
      result: { ok: true, status: "approved", message: `Approved. Charged ${name}'s card ${formatCents(captured)}.` },
      notifyKind: "approved",
    };
  });
  if (out.cancelPi) {
    const t = await withTenant(ctx.tenantId, (tx) => tenantById(tx, ctx.tenantId));
    await cancelPaymentQuietly(t.stripeAccountId, out.cancelPi, bookingId);
  }
  if (out.notifyKind === "expired") {
    await safeNotify(ctx.tenantId, { kind: "expired", bookingId });
    await safeNotify(ctx.tenantId, { kind: "staff_request_expired", bookingId });
  } else if (out.notifyKind) {
    await safeNotify(ctx.tenantId, { kind: out.notifyKind, bookingId });
  }
  return out.result;
}

/** Decline inside tx (hold released first). Shared by declineBooking and cancelBooking on requests. */
async function declineInTx(
  tx: Tx,
  ctx: StaffContext,
  t: TenantRow,
  b: BookingRow,
  reason: string | null,
  now: Date,
): Promise<StaffActionResult> {
  if (b.paymentIntentId) {
    try {
      const provider = await getPaymentProvider();
      await provider.cancel({ stripeAccountId: t.stripeAccountId, paymentIntentId: b.paymentIntentId, idempotencyKey: `cancel-${b.id}` });
    } catch (err) {
      return {
        ok: false,
        error: "payment_error",
        message: `Couldn't release the hold. Try again. (${err instanceof Error ? err.message : String(err)})`,
      };
    }
  }
  await deleteOccupancy(tx, t.id, b.id);
  await tx
    .update(bookings)
    .set({
      status: "declined",
      paymentStatus: b.paymentIntentId ? "canceled" : b.paymentStatus,
      declineReason: reason,
      decidedAt: now,
      decidedByUserId: ctx.userId,
      ...bump(now),
    })
    .where(eq(bookings.id, b.id));
  await writeAudit(tx, {
    tenantId: t.id,
    actorType: "staff",
    actorId: ctx.userId,
    action: "booking.decline",
    targetType: "booking",
    targetId: b.id,
    reason,
    at: now,
  });
  const customer = await customerOf(tx, b);
  return { ok: true, status: "declined", message: `Declined. Hold released and ${firstName(customer?.name)} emailed.` };
}

/** Release the hold and move to declined, with an optional reason for the customer. */
export async function declineBooking(ctx: StaffContext, bookingId: string, reason?: string): Promise<StaffActionResult> {
  if (!isUuid(bookingId)) return { ok: false, error: "not_found", message: "Booking not found." };
  const now = new Date();
  const note = (reason ?? "").trim().slice(0, 500) || null;
  const result = await withTenant(ctx.tenantId, async (tx): Promise<StaffActionResult> => {
    const t = await tenantById(tx, ctx.tenantId);
    const b = await lockBooking(tx, t.id, bookingId);
    if (!b) return { ok: false, error: "not_found", message: "Booking not found." };
    if (b.status !== "requested") return alreadyHandled(tx, t, b, now);
    return declineInTx(tx, ctx, t, b, note, now);
  });
  if (result.ok) await safeNotify(ctx.tenantId, { kind: "declined", bookingId });
  return result;
}

/** Facility cancellation. Staff: refund must be 'full'. Owner: full, partial or none. */
export async function cancelBooking(ctx: StaffContext, input: CancelBookingInput): Promise<StaffActionResult> {
  if (!input || !isUuid(input.bookingId)) return { ok: false, error: "not_found", message: "Booking not found." };
  if (!["full", "partial", "none"].includes(input.refund)) return { ok: false, error: "invalid", message: "Pick a refund option." };
  if (!isOwner(ctx) && input.refund !== "full") {
    return { ok: false, error: "forbidden", message: "Only the owner can give a partial refund or no refund." };
  }
  const now = new Date();
  const message = (input.message ?? "").trim().slice(0, 1000) || null;
  const provider = await getPaymentProvider();
  type Out = { result: StaffActionResult; notify?: "declined" | "cancelled_by_facility" };
  const out = await withTenant(ctx.tenantId, async (tx): Promise<Out> => {
    const t = await tenantById(tx, ctx.tenantId);
    const b = await lockBooking(tx, t.id, input.bookingId);
    if (!b) return { result: { ok: false, error: "not_found", message: "Booking not found." } };
    if (b.status === "requested") {
      // Nothing was charged: cancelling a request is a decline (hold released).
      const result = await declineInTx(tx, ctx, t, b, message, now);
      return { result, ...(result.ok ? { notify: "declined" as const } : {}) };
    }
    if (b.status === "completed") return { result: { ok: false, error: "invalid", message: "This booking already happened." } };
    if (b.status !== "approved") return { result: await alreadyHandled(tx, t, b, now) };

    const remaining = Math.max(0, b.amountCapturedCents - b.amountRefundedCents);
    let amount = 0;
    if (input.refund === "full") amount = remaining;
    else if (input.refund === "partial") {
      const a = Number(input.amountCents);
      if (!Number.isInteger(a) || a <= 0 || a > remaining) {
        return { result: { ok: false, error: "invalid", message: `Enter a refund between $0.01 and ${formatCents(remaining)}.` } };
      }
      amount = a;
    }
    if (amount > 0) {
      if (!b.paymentIntentId) return { result: { ok: false, error: "payment_error", message: "No payment to refund." } };
      await ensureFakeCaptured(t.stripeAccountId, b.paymentIntentId, b.id);
      const refund = await provider
        .refund({
          stripeAccountId: t.stripeAccountId,
          paymentIntentId: b.paymentIntentId,
          amountCents: amount,
          refundApplicationFee: true,
          idempotencyKey: `refund-${b.id}-facility`,
        })
        .catch((err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : String(err) }));
      if (!refund.ok) return { result: { ok: false, error: "payment_error", message: `The refund didn't go through: ${refund.reason}` } };
      amount = refund.amountRefundedCents;
    }
    const totalRefunded = b.amountRefundedCents + amount;
    await deleteOccupancy(tx, t.id, b.id);
    await tx
      .update(bookings)
      .set({
        status: "cancelled_by_facility",
        cancelReason: message,
        cancelledAt: now,
        amountRefundedCents: totalRefunded,
        paymentStatus:
          amount <= 0 ? b.paymentStatus : totalRefunded >= b.amountCapturedCents ? "refunded" : "partially_refunded",
        ...bump(now),
      })
      .where(eq(bookings.id, b.id));
    await writeAudit(tx, {
      tenantId: t.id,
      actorType: "staff",
      actorId: ctx.userId,
      action: "booking.cancel_facility",
      targetType: "booking",
      targetId: b.id,
      reason: message,
      data: { refund: input.refund, refundCents: amount },
      at: now,
    });
    const name = firstName((await customerOf(tx, b))?.name);
    return {
      result: {
        ok: true,
        status: "cancelled_by_facility",
        message: amount > 0 ? `Cancelled. Refunded ${formatCents(amount)} to ${name}.` : `Cancelled with no refund. ${name} was emailed.`,
      },
      notify: "cancelled_by_facility",
    };
  });
  if (out.notify) await safeNotify(ctx.tenantId, { kind: out.notify, bookingId: input.bookingId });
  return out.result;
}

// ------------------------------------------------------------ booking detail

const ACTION_LABELS: Record<string, string> = {
  "booking.hold": "Checkout started",
  "booking.abandon": "Checkout ended",
  "booking.request": "Request sent",
  "booking.approve": "Approved and charged",
  "booking.decline": "Declined",
  "booking.expire": "Expired: no decision in time",
  "booking.payment_failed": "Charge failed",
  "booking.cancel_customer": "Cancelled by customer",
  "booking.cancel_facility": "Cancelled by facility",
  "booking.complete": "Completed",
  "booking.notes": "Notes updated",
  "booking.resend_link": "Customer link re-sent",
  "booking.reminder": "Reminder sent to staff",
};

export async function getBookingDetail(ctx: StaffContext, bookingId: string): Promise<StaffBookingDetail | null> {
  if (!isUuid(bookingId)) return null;
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const [b] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, t.id), eq(bookings.id, bookingId)))
      .limit(1);
    if (!b) return null;
    const zone = t.timeZone;
    const map = await loadUnitMap(tx, t.id);
    const customer = await customerOf(tx, b);
    const audit = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, t.id), eq(auditLog.targetType, "booking"), eq(auditLog.targetId, b.id)))
      .orderBy(asc(auditLog.createdAt));
    const staffIds = [...new Set(audit.filter((a) => a.actorType === "staff" && isUuid(a.actorId)).map((a) => a.actorId!))];
    const staffNames = new Map<string, string>();
    if (staffIds.length) {
      const rows = await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, t.id), inArray(users.id, staffIds)));
      for (const r of rows) staffNames.set(r.id, r.name);
    }
    const history = audit.map((a) => {
      let action = ACTION_LABELS[a.action] ?? a.action;
      const data = (a.data ?? {}) as Record<string, unknown>;
      if (a.action === "booking.approve" && typeof data.amountCents === "number") action += ` ${formatCents(data.amountCents)}`;
      if ((a.action === "booking.cancel_facility" || a.action === "booking.cancel_customer") && typeof data.refundCents === "number" && data.refundCents > 0)
        action += `, refunded ${formatCents(data.refundCents)}`;
      const actor =
        a.actorType === "staff"
          ? staffNames.get(a.actorId ?? "") ?? "Staff"
          : a.actorType === "customer"
            ? customer?.name ?? "Customer"
            : "Tymo";
      return { at: a.createdAt.toISOString(), atLabel: atLabel(a.createdAt, zone), actor, action, reason: a.reason };
    });
    const owner = isOwner(ctx);
    const fee = b.applicationFeeCents ?? 0;
    const feeNet = b.amountCapturedCents > 0 ? fee - applicationFeeRefundCents(b.amountRefundedCents, b.amountCapturedCents, fee) : 0;
    const payout =
      b.amountCapturedCents > 0
        ? b.amountCapturedCents - b.amountRefundedCents - feeNet - estimatedStripeFeeCents(b.amountCapturedCents)
        : null;
    return {
      bookingId: b.id,
      status: b.status,
      statusLabel: staffStatusLabel(b),
      paymentStatus: b.paymentStatus,
      resourceId: b.resourceId,
      resourceLabel: staffResourceLabel(map, b.resourceId),
      whenLabel: queueWhenLabel(b.startsAt, b.endsAt, zone),
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      customer: { name: customer?.name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "" },
      team: b.team,
      priceCents: b.priceCents,
      amountCapturedCents: b.amountCapturedCents,
      amountRefundedCents: b.amountRefundedCents,
      tymoFeeCents: owner ? (b.amountCapturedCents > 0 ? feeNet : fee || null) : null,
      payoutCents: owner ? payout : null,
      cardLabel: formatCard(b.cardBrand, b.cardLast4),
      waiverAcceptedLabel: b.waiverAcceptedAt
        ? `Accepted ${atLabel(b.waiverAcceptedAt, zone)}${b.waiverVersion ? ` (v${b.waiverVersion})` : ""}`
        : null,
      approvalDeadlineLabel: b.status === "requested" && b.approvalDeadlineAt ? atLabel(b.approvalDeadlineAt, zone) : null,
      declineReason: b.declineReason,
      cancelReason: b.cancelReason,
      staffNotes: b.staffNotes,
      history,
      canApprove: b.status === "requested",
      canDecline: b.status === "requested",
      cancelOptions: b.status === "approved" ? (owner ? ["full", "partial", "none"] : ["full"]) : [],
    };
  });
}

export async function saveStaffNotes(ctx: StaffContext, bookingId: string, notes: string): Promise<void> {
  if (!isUuid(bookingId)) return;
  const now = new Date();
  const text = (notes ?? "").trim().slice(0, 4000) || null;
  await withTenant(ctx.tenantId, async (tx) => {
    const updated = await tx
      .update(bookings)
      .set({ staffNotes: text, ...bump(now) })
      .where(and(eq(bookings.tenantId, ctx.tenantId), eq(bookings.id, bookingId)))
      .returning({ id: bookings.id });
    if (!updated.length) return;
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorType: "staff",
      actorId: ctx.userId,
      action: "booking.notes",
      targetType: "booking",
      targetId: bookingId,
      at: now,
    });
  });
}

/** Re-send the customer's private link email. */
export async function resendCustomerLink(ctx: StaffContext, bookingId: string): Promise<void> {
  if (!isUuid(bookingId)) return;
  const now = new Date();
  const ok = await withTenant(ctx.tenantId, async (tx) => {
    const [b] = await tx
      .select({ id: bookings.id, publicToken: bookings.publicToken })
      .from(bookings)
      .where(and(eq(bookings.tenantId, ctx.tenantId), eq(bookings.id, bookingId)))
      .limit(1);
    if (!b?.publicToken) return false;
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorType: "staff",
      actorId: ctx.userId,
      action: "booking.resend_link",
      targetType: "booking",
      targetId: bookingId,
      at: now,
    });
    return true;
  });
  if (ok) await safeNotify(ctx.tenantId, { kind: "customer_link", bookingId });
}

// ------------------------------------------------------------ calendar

function laneLabel(r: ResourceRow): string {
  const i = r.name.indexOf(" · ");
  return i >= 0 ? r.name.slice(i + 3) : r.code;
}

async function buildCalendar(tx: Tx, t: TenantRow, dates: string[], resourceId: string | undefined, now: Date): Promise<CalendarDay[]> {
  const zone = t.timeZone;
  const map = await loadUnitMap(tx, t.id);
  const hours = await loadHours(tx, t.id);
  const from = startOfLocalDate(dates[0], zone).toJSDate();
  const to = startOfLocalDate(addDays(dates[dates.length - 1], 1), zone).toJSDate();
  const bookingRows = (
    await tx
      .select({ b: bookings, customerName: customers.name })
      .from(bookings)
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(
        and(
          eq(bookings.tenantId, t.id),
          inArray(bookings.status, ["checking_out", "requested", "approved", "completed"]),
          lt(bookings.startsAt, to),
          gt(bookings.endsAt, from),
        ),
      )
  ).filter(({ b }) => b.status !== "checking_out" || (b.checkoutExpiresAt && b.checkoutExpiresAt > now));
  const activeBlocks = await loadActiveBlocks(tx, t.id, from, to, zone);
  const blockOccs = activeBlocks.map((block) => ({
    block,
    units: blockUnitIds(map, block.resourceId),
    occs: blockOccurrences(block, zone, { from, to }),
  }));

  let parents = map.resources.filter((r) => !r.parentId && r.active);
  if (resourceId) {
    const target = map.byId.get(resourceId);
    const parentId = target?.parentId ?? target?.id;
    parents = parents.filter((p) => p.id === parentId);
  }
  const codes = (ids: string[]) => ids.map((u) => map.unitCode.get(u) ?? "").filter(Boolean);

  return dates.map((date) => {
    const dayStart = startOfLocalDate(date, zone).toJSDate();
    const dayEnd = startOfLocalDate(addDays(date, 1), zone).toJSDate();
    const weekday = dt(dayStart, zone).weekday;
    const todays = hours.filter((h) => h.weekday === weekday);
    let startMin = todays.length ? Math.min(...todays.map((h) => minutesOfDay(h.opensAt))) : 7 * 60;
    let endMin = todays.length ? Math.max(...todays.map((h) => minutesOfDay(h.closesAt))) : 21 * 60;
    const clip = (s: Date, e: Date) => ({
      start: s < dayStart ? dayStart : s,
      end: e > dayEnd ? dayEnd : e,
    });

    const rows: CalendarRow[] = parents.map((p) => {
      const rowUnits = new Set(map.unitsOf.get(p.id) ?? []);
      for (const c of map.childrenOf.get(p.id) ?? []) for (const u of map.unitsOf.get(c.id) ?? []) rowUnits.add(u);
      const items: CalendarItem[] = [];
      for (const { b, customerName } of bookingRows) {
        if (!(b.startsAt < dayEnd && b.endsAt > dayStart)) continue;
        const hit = (map.unitsOf.get(b.resourceId) ?? []).filter((u) => rowUnits.has(u));
        if (!hit.length) continue;
        const { start, end } = clip(b.startsAt, b.endsAt);
        items.push({
          id: b.id,
          kind: b.status === "requested" ? "request" : b.status === "checking_out" ? "hold" : "booking",
          resourceId: b.resourceId,
          unitCodes: codes(hit),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          startLocal: timeLabel(start, zone),
          endLocal: timeLabel(end, zone),
          label: b.status === "checking_out" ? "Checkout in progress" : b.team || customerName || "Booking",
          bookingId: b.id,
        });
      }
      for (const { block, units, occs } of blockOccs) {
        const hit = units.filter((u) => rowUnits.has(u));
        if (!hit.length) continue;
        for (const o of occs) {
          if (!(o.start < dayEnd && o.end > dayStart)) continue;
          const { start, end } = clip(o.start, o.end);
          items.push({
            id: block.id,
            kind: block.kind === "closure" ? "closure" : "block",
            resourceId: block.resourceId ?? p.id,
            unitCodes: codes(hit),
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            startLocal: timeLabel(start, zone),
            endLocal: timeLabel(end, zone),
            label: block.label,
            blockId: block.id,
            ...(o.date ? { occurrenceDate: o.date } : {}),
          });
        }
      }
      items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return {
        resourceId: p.id,
        code: p.code,
        name: p.name,
        lanes: (map.childrenOf.get(p.id) ?? [])
          .filter((c) => c.active)
          .map((c) => ({ resourceId: c.id, code: c.code, label: laneLabel(c), unitCodes: codes(map.unitsOf.get(c.id) ?? []) })),
        unitCodes: codes([...rowUnits]),
        items,
      };
    });
    for (const row of rows) {
      for (const item of row.items) {
        const s = dt(new Date(item.startsAt), zone);
        const e = dt(new Date(item.endsAt), zone);
        const sm = s.hour * 60 + s.minute;
        const em = e.toISODate() !== date ? 24 * 60 : e.hour * 60 + e.minute;
        if (sm < startMin) startMin = Math.floor(sm / 60) * 60;
        if (em > endMin) endMin = Math.ceil(em / 60) * 60;
      }
    }
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return {
      date,
      dateLabel: shortDateLabel(date, zone),
      dayStartLocal: hhmm(startMin),
      dayEndLocal: hhmm(endMin),
      timeZoneLabel: zoneLabel(zone, new Date(dayStart.getTime() + 12 * HOUR)),
      rows,
    };
  });
}

/** Day view: one row per parent field with half lanes beneath. date = facility-local "YYYY-MM-DD". */
export async function getCalendarDay(ctx: StaffContext, date: string): Promise<CalendarDay> {
  if (!isValidDate(date)) throw new Error("Invalid date");
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    return (await buildCalendar(tx, t, [date], undefined, now))[0];
  });
}

/** Week view: seven CalendarDays starting at weekStart, optionally one field only. */
export async function getCalendarWeek(ctx: StaffContext, weekStart: string, resourceId?: string): Promise<CalendarDay[]> {
  if (!isValidDate(weekStart)) throw new Error("Invalid date");
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    return buildCalendar(tx, t, dateRange(weekStart, addDays(weekStart, 6)), resourceId && isUuid(resourceId) ? resourceId : undefined, now);
  });
}

// ------------------------------------------------------------ blocks

interface NormalizedBlock extends BlockShape {
  label: string;
  publicReason: string | null;
  resourceId: string | null;
  allDay: boolean;
}

function normalizeBlock(input: BlockInput, t: TenantRow, map: UnitMap): { ok: true; block: NormalizedBlock } | { ok: false; message: string } {
  const zone = t.timeZone;
  if (!input || !["one_time", "weekly", "closure"].includes(input.kind)) return { ok: false, message: "Pick a block type." };
  const publicReason = input.kind === "closure" ? (input.publicReason ?? "").trim().slice(0, 120) || null : null;
  const label = (input.label ?? "").trim().slice(0, 120) || publicReason || "";
  if (!label) return { ok: false, message: "Add a label." };
  let resourceId: string | null = null;
  if (input.resourceId) {
    if (!isUuid(input.resourceId) || !map.byId.has(input.resourceId)) return { ok: false, message: "Pick a field." };
    resourceId = input.resourceId;
  } else if (input.kind !== "closure") {
    return { ok: false, message: "Pick a field. Only closures can cover the whole venue." };
  }
  const base = {
    label,
    publicReason,
    resourceId,
    kind: input.kind,
    startsAt: null,
    endsAt: null,
    weekdays: null,
    startLocal: null,
    endLocal: null,
    startDate: null,
    endDate: null,
    skipDates: [] as string[],
    allDay: false,
  };
  const timesOk = (s?: string, e?: string) => !!s && !!e && isValidTime(s) && isValidTime(e) && minutesOfDay(e) > minutesOfDay(s);

  if (input.kind === "weekly") {
    const weekdays = [...new Set((input.weekdays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    if (!weekdays.length) return { ok: false, message: "Pick at least one weekday." };
    if (!input.startDate || !input.untilDate || !isValidDate(input.startDate) || !isValidDate(input.untilDate))
      return { ok: false, message: "Pick start and end dates." };
    if (input.untilDate < input.startDate) return { ok: false, message: "The end date is before the start date." };
    if (input.untilDate > addDays(input.startDate, 3 * 366)) return { ok: false, message: "Weekly blocks can run up to 3 years." };
    if (!timesOk(input.startLocal, input.endLocal)) return { ok: false, message: "Pick a start time before the end time." };
    return {
      ok: true,
      block: {
        ...base,
        weekdays: weekdays.sort(),
        startLocal: input.startLocal!,
        endLocal: input.endLocal!,
        startDate: input.startDate,
        endDate: input.untilDate,
      },
    };
  }
  if (!input.date || !isValidDate(input.date)) return { ok: false, message: "Pick a date." };
  const endDate = input.kind === "closure" && input.endDate ? input.endDate : input.date;
  if (!isValidDate(endDate) || endDate < input.date) return { ok: false, message: "The end date is before the start date." };
  let start: Date;
  let end: Date;
  if (input.allDay) {
    start = startOfLocalDate(input.date, zone).toJSDate();
    end = startOfLocalDate(addDays(endDate, 1), zone).toJSDate();
  } else if (input.kind === "closure") {
    const s = input.startLocal ?? "00:00";
    const e = input.endLocal ?? "24:00";
    if (!isValidTime(s) || !isValidTime(e)) return { ok: false, message: "Pick valid times." };
    start = atLocalLenient(input.date, s, zone);
    end = atLocal(endDate, e, zone) ?? atLocalLenient(endDate, e, zone);
  } else {
    if (!timesOk(input.startLocal, input.endLocal)) return { ok: false, message: "Pick a start time before the end time." };
    start = atLocalLenient(input.date, input.startLocal!, zone);
    end = atLocal(input.date, input.endLocal!, zone) ?? atLocalLenient(input.date, input.endLocal!, zone);
  }
  if (end <= start) return { ok: false, message: "Pick a start time before the end time." };
  return { ok: true, block: { ...base, startsAt: start, endsAt: end, allDay: !!input.allDay } };
}

function isLocalMidnight(at: Date, zone: string): boolean {
  const d = dt(at, zone);
  return d.hour === 0 && d.minute === 0;
}

const monthDay = (date: string, zone: string) => startOfLocalDate(date, zone).toFormat("LLL d");

function blockSummary(b: BlockShape, zone: string, occurrenceCount?: number): string {
  if (b.kind === "weekly") {
    const occs = blockOccurrences(b, zone);
    const n = occurrenceCount ?? occs.length;
    const first = occs[0]?.date ?? b.startDate!;
    const last = occs[occs.length - 1]?.date ?? b.endDate!;
    return `Every ${weekdaysLabel(b.weekdays ?? [])}, ${monthDay(first, zone)} to ${monthDay(last, zone)}: ${n} ${n === 1 ? "date" : "dates"}.`;
  }
  const s = b.startsAt!;
  const e = b.endsAt!;
  const allDay = isLocalMidnight(s, zone) && isLocalMidnight(e, zone);
  const lastDay = allDay ? localDate(new Date(e.getTime() - MINUTE), zone) : localDate(e, zone);
  const prefix = b.kind === "closure" ? "Closed " : "";
  if (allDay) {
    if (lastDay === localDate(s, zone)) return `${prefix}${shortDateLabel(s, zone)}, all day`;
    return `${prefix}${shortDateLabel(s, zone)} to ${shortDateLabel(lastDay, zone)}`;
  }
  if (lastDay !== localDate(s, zone)) {
    if (isLocalMidnight(e, zone) && localDate(new Date(e.getTime() - MINUTE), zone) === localDate(s, zone))
      return `${prefix}${shortDateLabel(s, zone)} from ${timeLabel(s, zone)}`;
    return `${prefix}${shortDateLabel(s, zone)} ${timeLabel(s, zone)} to ${shortDateLabel(e, zone)} ${timeLabel(e, zone)} ${zoneLabel(zone, s)}`;
  }
  return `${prefix}${shortDateLabel(s, zone)}, ${timeRangeLabel(s, e, zone)} ${zoneLabel(zone, s)}`;
}

function overlapNote(map: UnitMap, resourceId: string | null): string | null {
  if (!resourceId) return null;
  const r = map.byId.get(resourceId);
  if (!r) return null;
  const mine = new Set(map.unitsOf.get(r.id) ?? []);
  const affected = map.resources.filter(
    (o) => o.id !== r.id && o.active && (map.unitsOf.get(o.id) ?? []).some((u) => mine.has(u)),
  );
  if (!affected.length) return null;
  const parent = r.parentId ? affected.find((a) => a.id === r.parentId) : undefined;
  if (parent && affected.length === 1) return `${parent.code} full field also becomes unavailable.`;
  const codes = affected.map((a) => a.code);
  const list = codes.length === 1 ? codes[0] : `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
  return `Also blocks ${list}`;
}

/** Occurrences that still matter: in the future (past dates never change), clipped to now. */
function futureOccurrences(occs: Occurrence[], now: Date): Occurrence[] {
  return occs.filter((o) => o.end > now).map((o) => (o.start < now ? { ...o, start: now } : o));
}

async function computePreview(
  tx: Tx,
  t: TenantRow,
  map: UnitMap,
  block: NormalizedBlock,
  now: Date,
): Promise<{ preview: BlockPreview; unitIds: string[]; occurrences: Occurrence[] }> {
  const zone = t.timeZone;
  const unitIds = blockUnitIds(map, block.resourceId);
  const all = blockOccurrences(block, zone);
  const occurrences = futureOccurrences(all, now);
  const rows = await findBlockConflicts(tx, { tenantId: t.id, unitIds, occurrences });
  const conflicts: BlockConflict[] = rows.map((r) => ({
    bookingId: r.bookingId,
    status: r.status,
    customerName: r.customerName,
    resourceLabel: staffResourceLabel(map, r.resourceId),
    whenLabel: queueWhenLabel(r.startsAt, r.endsAt, zone),
    priceCents: r.priceCents,
    ...(r.occurrenceDate ? { occurrenceDate: r.occurrenceDate } : {}),
  }));
  const conflictDates = block.kind === "weekly" ? [...new Set(rows.map((r) => r.occurrenceDate).filter((d): d is string => !!d))].sort() : [];
  const remaining = all.length - conflictDates.length;
  return {
    unitIds,
    occurrences,
    preview: {
      summary: blockSummary(block, zone, all.length),
      occurrenceCount: all.length,
      overlapNote: overlapNote(map, block.resourceId),
      conflicts,
      conflictDates,
      canSave: conflicts.length === 0 && all.length > 0,
      canSaveSkippingConflicts: block.kind === "weekly" && conflicts.length > 0 && remaining > 0,
    },
  };
}

function invalidPreview(message: string): BlockPreview {
  return {
    summary: message,
    occurrenceCount: 0,
    overlapNote: null,
    conflicts: [],
    conflictDates: [],
    canSave: false,
    canSaveSkippingConflicts: false,
  };
}

/** What saving this block would do: occurrences, overlap note, conflicting bookings. */
export async function previewBlock(ctx: StaffContext, input: BlockInput): Promise<BlockPreview> {
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const map = await loadUnitMap(tx, t.id);
    const norm = normalizeBlock(input, t, map);
    if (!norm.ok) return invalidPreview(norm.message);
    return (await computePreview(tx, t, map, norm.block, now)).preview;
  });
}

/**
 * Save a block. Overlapping Requested/Approved bookings are never touched:
 * one_time/closure with conflicts fail with error 'conflicts'; weekly with
 * conflicts fails unless skipConflicts is true, in which case those dates
 * are added to skipDates. Checkout holds in the way are removed.
 */
export async function createBlock(
  ctx: StaffContext,
  input: BlockInput,
  options?: { skipConflicts?: boolean },
): Promise<CreateBlockResult> {
  const now = new Date();
  let released: { bookingId: string; paymentIntentId: string | null }[] = [];
  let stripeAccountId: string | null = null;
  const attempt = () =>
    withTenant(ctx.tenantId, async (tx): Promise<CreateBlockResult> => {
      const t = await tenantById(tx, ctx.tenantId);
      stripeAccountId = t.stripeAccountId;
      const map = await loadUnitMap(tx, t.id);
      const norm = normalizeBlock(input, t, map);
      if (!norm.ok) return { ok: false, error: "invalid", message: norm.message };
      const { preview, unitIds, occurrences } = await computePreview(tx, t, map, norm.block, now);
      if (preview.occurrenceCount === 0) return { ok: false, error: "invalid", message: "These dates have no matching days.", preview };
      if (preview.conflicts.length) {
        if (norm.block.kind !== "weekly" || !options?.skipConflicts || !preview.canSaveSkippingConflicts) {
          return { ok: false, error: "conflicts", preview };
        }
      }
      const skippedDates = norm.block.kind === "weekly" ? preview.conflictDates : [];
      const [row] = await tx
        .insert(blocks)
        .values({
          tenantId: t.id,
          kind: norm.block.kind,
          label: norm.block.label,
          publicReason: norm.block.publicReason,
          resourceId: norm.block.resourceId,
          startsAt: norm.block.startsAt,
          endsAt: norm.block.endsAt,
          weekdays: norm.block.weekdays,
          startLocal: norm.block.startLocal,
          endLocal: norm.block.endLocal,
          startDate: norm.block.startDate,
          endDate: norm.block.endDate,
          skipDates: skippedDates,
          createdByUserId: ctx.userId,
          createdAt: now,
        })
        .returning();
      const skip = new Set(skippedDates);
      released = await releaseHoldsUnderBlock(tx, {
        tenantId: t.id,
        unitIds,
        occurrences: occurrences.filter((o) => !o.date || !skip.has(o.date)),
        actorId: ctx.userId,
        now,
      });
      const horizonEnd = startOfLocalDate(addDays(materializeHorizon(now, t.timeZone, t.bookingWindowDays), 1), t.timeZone).toJSDate();
      await materializeBlock(tx, {
        tenantId: t.id,
        block: row,
        zone: t.timeZone,
        unitIds,
        from: now,
        to: row.kind === "weekly" ? horizonEnd : FAR_FUTURE,
        mode: "throw",
      });
      await writeAudit(tx, {
        tenantId: t.id,
        actorType: "staff",
        actorId: ctx.userId,
        action: row.kind === "closure" ? "closure.create" : "block.create",
        targetType: "block",
        targetId: row.id,
        data: { kind: row.kind, label: row.label, resourceId: row.resourceId, skippedDates, summary: preview.summary },
        at: now,
      });
      return { ok: true, blockId: row.id, savedCount: preview.occurrenceCount - skippedDates.length, skippedDates };
    });
  let result: CreateBlockResult;
  try {
    result = await attempt();
  } catch (err) {
    released = [];
    if (!isExclusionViolation(err)) throw err;
    // Someone booked or held the time while we were saving: show the fresh picture.
    const preview = await previewBlock(ctx, input);
    return { ok: false, error: "conflicts", preview, message: "Something was booked in that time just now. Check the list and try again." };
  }
  for (const r of released) await cancelPaymentQuietly(stripeAccountId, r.paymentIntentId, r.bookingId);
  return result;
}

/** Re-materialize other blocks over freed time (their rows may have been trimmed around the removed block). */
async function refillBlocks(tx: Tx, t: TenantRow, map: UnitMap, exceptId: string, from: Date, to: Date, now: Date) {
  const start = from < now ? now : from;
  if (to <= start) return;
  const horizonEnd = startOfLocalDate(addDays(materializeHorizon(now, t.timeZone, t.bookingWindowDays), 1), t.timeZone).toJSDate();
  for (const other of await loadActiveBlocks(tx, t.id, start, to, t.timeZone)) {
    if (other.id === exceptId) continue;
    const end = other.kind === "weekly" && horizonEnd < to ? horizonEnd : to;
    if (end <= start) continue;
    await materializeBlock(tx, {
      tenantId: t.id,
      block: other,
      zone: t.timeZone,
      unitIds: blockUnitIds(map, other.resourceId),
      from: start,
      to: end,
      mode: "skip",
    });
  }
}

/** Remove one occurrence ('this'), this and later ('following'), or the whole block ('all'). */
export async function removeBlock(
  ctx: StaffContext,
  blockId: string,
  scope: "this" | "following" | "all",
  occurrenceDate?: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isUuid(blockId)) return { ok: false, message: "Block not found." };
  if (!["this", "following", "all"].includes(scope)) return { ok: false, message: "Pick what to remove." };
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const zone = t.timeZone;
    const map = await loadUnitMap(tx, t.id);
    const [block] = await tx
      .select()
      .from(blocks)
      .where(and(eq(blocks.tenantId, t.id), eq(blocks.id, blockId), isNull(blocks.deletedAt)))
      .limit(1);
    if (!block) return { ok: false, message: "Block not found." };
    const resourceCode = block.resourceId ? map.byId.get(block.resourceId)?.code ?? "The field" : "The venue";
    const today = localDate(now, zone);
    let message: string;
    let deleteFrom: string | null = null; // weekly: delete rows with occurrence_date >= this
    let deleteOnly: string | null = null; // weekly: delete rows for this date only

    if (block.kind === "weekly" && scope !== "all") {
      if (!occurrenceDate || !isValidDate(occurrenceDate)) return { ok: false, message: "Pick a date." };
      if (occurrenceDate < today) return { ok: false, message: "Past dates can't be changed." };
    }
    if (block.kind === "weekly" && scope === "this") {
      const occ = blockOccurrences(block, zone).find((o) => o.date === occurrenceDate);
      if (!occ) return { ok: false, message: "That date isn't part of this block." };
      await tx
        .update(blocks)
        .set({ skipDates: [...new Set([...(block.skipDates ?? []), occurrenceDate!])].sort() })
        .where(eq(blocks.id, block.id));
      deleteOnly = occurrenceDate!;
      message = `Removed ${block.label} on ${shortDateLabel(occurrenceDate!, zone)}. ${resourceCode} opens for booking ${timeRangeLabel(occ.start, occ.end, zone)}.`;
    } else if (block.kind === "weekly" && (scope === "following" || scope === "all")) {
      const cut = scope === "following" ? occurrenceDate! : today;
      if (block.startDate! >= cut) {
        await tx.update(blocks).set({ deletedAt: now }).where(eq(blocks.id, block.id));
        deleteFrom = block.startDate!;
      } else {
        await tx.update(blocks).set({ endDate: addDays(cut, -1) }).where(eq(blocks.id, block.id));
        deleteFrom = cut;
      }
      message =
        scope === "following"
          ? `Removed ${block.label} from ${shortDateLabel(cut, zone)} on.`
          : `Removed ${block.label}. ${resourceCode} opens for booking ${hhmmRangeLabel(block.startLocal!, block.endLocal!)} on ${weekdaysLabel(block.weekdays ?? [])}s.`;
    } else {
      await tx.update(blocks).set({ deletedAt: now }).where(eq(blocks.id, block.id));
      message = `Removed ${block.label}.`;
    }

    const conds = [eq(unitOccupancy.tenantId, t.id), eq(unitOccupancy.blockId, block.id)];
    if (deleteOnly) conds.push(eq(unitOccupancy.occurrenceDate, deleteOnly));
    if (deleteFrom) conds.push(sql`${unitOccupancy.occurrenceDate} >= ${deleteFrom}`);
    const deleted = await tx
      .delete(unitOccupancy)
      .where(and(...conds))
      .returning({ during: unitOccupancy.during });
    if (deleted.length) {
      const bounds = deleted.map((d) => parseRange(d.during));
      const from = new Date(Math.min(...bounds.map((b) => b.start.getTime())));
      const to = new Date(Math.max(...bounds.map((b) => b.end.getTime())));
      await refillBlocks(tx, t, map, block.id, from, to, now);
    }
    await writeAudit(tx, {
      tenantId: t.id,
      actorType: "staff",
      actorId: ctx.userId,
      action: block.kind === "closure" ? "closure.remove" : "block.remove",
      targetType: "block",
      targetId: block.id,
      data: { scope, occurrenceDate: occurrenceDate ?? null, label: block.label },
      at: now,
    });
    return { ok: true, message };
  });
}

export async function listBlocks(ctx: StaffContext): Promise<BlockListItem[]> {
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const zone = t.timeZone;
    const map = await loadUnitMap(tx, t.id);
    const today = localDate(now, zone);
    const rows = await tx
      .select()
      .from(blocks)
      .where(and(eq(blocks.tenantId, t.id), isNull(blocks.deletedAt)));
    const live = rows.filter((b) => (b.kind === "weekly" ? (b.endDate ?? "") >= today : (b.endsAt?.getTime() ?? 0) > now.getTime()));
    const sortKey = (b: BlockRow) =>
      b.kind === "weekly" ? startOfLocalDate(b.startDate!, zone).toMillis() : (b.startsAt?.getTime() ?? 0);
    live.sort((a, b) => sortKey(a) - sortKey(b));
    return live.map((b) => {
      let summary: string;
      if (b.kind === "weekly") {
        const upcoming = blockOccurrences(b, zone).filter((o) => o.date! >= today);
        const first = upcoming[0]?.date ?? b.startDate!;
        summary = `Every ${weekdaysLabel(b.weekdays ?? [])}, ${hhmmRangeLabel(b.startLocal!, b.endLocal!)}, ${monthDay(first, zone)} to ${monthDay(b.endDate!, zone)}`;
      } else {
        summary = blockSummary(b, zone);
      }
      return {
        blockId: b.id,
        kind: b.kind,
        label: b.label,
        resourceLabel: b.resourceId ? map.byId.get(b.resourceId)?.code ?? "" : "Whole venue",
        summary,
      };
    });
  });
}

// ------------------------------------------------------------ setup + settings

export async function getSetupChecklist(ctx: StaffContext): Promise<SetupChecklist> {
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    return {
      fieldsConfirmed: !!t.fieldsConfirmedAt,
      payoutsConnected: !!t.stripeAccountId && t.stripeChargesEnabled,
      testBookingDone: !!t.testBookingDoneAt,
      bookingsEnabled: t.bookingsEnabled,
      bookingLink: `${env.appUrl.replace(/\/$/, "")}/book/${t.slug}`,
    };
  });
}

/** Owner: "Looks right" on fields and prices. */
export async function confirmFieldsAndPrices(ctx: StaffContext): Promise<void> {
  if (!isOwner(ctx)) throw new Error("Only the owner can confirm fields and prices.");
  const now = new Date();
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.update(tenants).set({ fieldsConfirmedAt: now }).where(eq(tenants.id, ctx.tenantId));
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorType: "staff",
      actorId: ctx.userId,
      action: "tenant.fields_confirmed",
      targetType: "tenant",
      targetId: ctx.tenantId,
      at: now,
    });
  });
}

/** Owner: turn the public booking page on or off (requires payouts connected to turn on). */
export async function setBookingsEnabled(ctx: StaffContext, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  if (!isOwner(ctx)) return { ok: false, message: "Only the owner can turn bookings on or off." };
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    if (enabled && !(t.stripeAccountId && t.stripeChargesEnabled)) {
      return { ok: false, message: "Bookings are off until payouts are set up." };
    }
    await tx.update(tenants).set({ bookingsEnabled: !!enabled }).where(eq(tenants.id, t.id));
    await writeAudit(tx, {
      tenantId: t.id,
      actorType: "staff",
      actorId: ctx.userId,
      action: enabled ? "tenant.bookings_on" : "tenant.bookings_off",
      targetType: "tenant",
      targetId: t.id,
      at: now,
    });
    return { ok: true, message: enabled ? "Bookings are on. Share your booking link." : "Bookings are off." };
  });
}

export async function getSettings(ctx: StaffContext): Promise<SettingsView> {
  return withTenant(ctx.tenantId, async (tx) => {
    const t = await tenantById(tx, ctx.tenantId);
    const resRows = await tx
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, t.id), eq(resources.active, true)))
      .orderBy(asc(resources.sortOrder), asc(resources.code));
    const hours = await tx
      .select()
      .from(operatingHours)
      .where(eq(operatingHours.tenantId, t.id))
      .orderBy(asc(operatingHours.weekday), asc(operatingHours.opensAt));
    const staff = await tx
      .select()
      .from(users)
      .where(eq(users.tenantId, t.id))
      .orderBy(asc(users.role), asc(users.name));
    return {
      facility: toFacilityPublic(t),
      resources: resRows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        groupLabel: r.groupLabel,
        priceCentsPerHour: r.priceCentsPerHour,
        minMinutes: r.minMinutes,
        maxMinutes: r.maxMinutes,
        slotMinutes: r.slotMinutes,
      })),
      hours: hours.map((h) => ({ resourceId: h.resourceId, weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
      staff: staff.map((u) => ({ userId: u.id, name: u.name, email: u.email, role: u.role })),
      payouts: { connected: !!t.stripeAccountId, chargesEnabled: t.stripeChargesEnabled, detailsSubmitted: t.stripeDetailsSubmitted },
      canEdit: isOwner(ctx),
    };
  });
}

/** Owner only. */
export async function updateResourcePrice(
  ctx: StaffContext,
  resourceId: string,
  priceCentsPerHour: number,
): Promise<{ ok: boolean; message: string }> {
  if (!isOwner(ctx)) return { ok: false, message: "Only the owner can change prices." };
  if (!isUuid(resourceId)) return { ok: false, message: "Field not found." };
  if (!Number.isInteger(priceCentsPerHour) || priceCentsPerHour <= 0 || priceCentsPerHour > 1_000_000) {
    return { ok: false, message: "Enter a price between $0.01 and $10,000 per hour." };
  }
  const now = new Date();
  return withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, ctx.tenantId), eq(resources.id, resourceId)))
      .limit(1);
    if (!r) return { ok: false, message: "Field not found." };
    await tx.update(resources).set({ priceCentsPerHour }).where(eq(resources.id, r.id));
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorType: "staff",
      actorId: ctx.userId,
      action: "resource.price",
      targetType: "resource",
      targetId: r.id,
      data: { fromCents: r.priceCentsPerHour, toCents: priceCentsPerHour },
      at: now,
    });
    return { ok: true, message: `Saved. ${r.code} is now ${formatRate(priceCentsPerHour)}.` };
  });
}

/** Owner only: invite a staff member (sends a sign-in link). */
export async function inviteStaff(
  ctx: StaffContext,
  input: { name: string; email: string; role: "owner" | "staff" },
): Promise<{ ok: boolean; message: string }> {
  if (!isOwner(ctx)) return { ok: false, message: "Only the owner can invite staff." };
  const name = (input?.name ?? "").trim().slice(0, 120);
  const email = normalizeEmail(input?.email ?? "");
  const role = input?.role === "owner" ? "owner" : "staff";
  if (!name) return { ok: false, message: "Enter their name." };
  if (!isEmail(email)) return { ok: false, message: "Enter an email address, like name@example.com." };
  const now = new Date();
  const created = await withTenant(ctx.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.email, email)))
      .limit(1);
    if (existing) return null;
    const [u] = await tx.insert(users).values({ tenantId: ctx.tenantId, email, name, role, createdAt: now }).returning({ id: users.id });
    const inviter = (await userName(tx, ctx.tenantId, ctx.userId)) ?? "Your team";
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorType: "staff",
      actorId: ctx.userId,
      action: "staff.invite",
      targetType: "user",
      targetId: u.id,
      data: { email, role },
      at: now,
    });
    return { userId: u.id, inviter };
  });
  if (!created) return { ok: false, message: `${email} already has access.` };
  try {
    const { createMagicLinkUrl } = await import("@/server/auth");
    const url = await createMagicLinkUrl(created.userId);
    await safeNotify(ctx.tenantId, { kind: "staff_invite", userId: created.userId, url, invitedByName: created.inviter });
  } catch (err) {
    console.warn(`[booking] invite link for ${created.userId} not sent: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: true, message: `Added ${name}. The sign-in email couldn't be sent; they can request a link from the sign-in page.` };
  }
  return { ok: true, message: `Invited ${name}. We emailed ${email} a sign-in link.` };
}
