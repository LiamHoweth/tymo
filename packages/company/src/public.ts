import "server-only";
import { and, eq } from "drizzle-orm";
import { env } from "@tymo/shared/env";
import { formatCard } from "@tymo/shared/format";
import type {
  BookingPublicView,
  CancelByTokenResult,
  CustomerDetailsInput,
  DateChip,
  DayAvailability,
  FacilityPublic,
  FieldCard,
  FieldGroup,
  PreparePaymentResult,
  ResourceOption,
  SaveDetailsResult,
  StartCheckoutError,
  StartCheckoutResult,
  SubmitRequestInput,
  SubmitRequestResult,
} from "@tymo/shared/types";
import { withTenant, type Tx } from "@tymo/db";
import { bookings, customers, unitOccupancy } from "@tymo/db/schema";
import { applicationFeeCents, getPaymentProvider } from "@tymo/platform/payments";
import type { HoldInfo } from "@tymo/platform/payments/types";
import { writeAudit } from "./core/audit";
import { computeDateChips, computeDayAvailability, isValidDuration, loadHours } from "./core/availability";
import { approvalDeadline, isEmail, isUuid, normalizeEmail, normalizePhone } from "./core/rules";
import { atLabel, checkoutWhenLabel, isValidDate, localDate, longWhenLabel } from "./core/time";
import { getResource, loadUnitMap, type ResourceRow, type UnitMap } from "./core/units";
import { isExclusionViolation, MINUTE, randomToken, rangeLiteral } from "./core/util";
import {
  abandonExpiredCheckouts,
  bump,
  cancelPaymentQuietly,
  customerStatusLabel,
  deleteOccupancy,
  ensureFakeCaptured,
  liveHoldCount,
  lockBooking,
  safeNotify,
  tenantBySlug,
  toFacilityPublic,
  type BookingRow,
  type TenantRow,
} from "./internal";

/**
 * Public (customer-facing) booking engine API. Every function resolves the
 * facility by slug, then runs inside withTenant(). Owned by the booking
 * engine module; the UI calls these from server actions / server components.
 */

const DAY = 24 * 60 * MINUTE;

/** Facility branding and rules for /book/[slug]. null if no such slug. */
export async function getFacility(slug: string): Promise<FacilityPublic | null> {
  const t = await tenantBySlug(slug);
  return t ? toFacilityPublic(t) : null;
}

function choiceLabel(r: ResourceRow): string {
  const i = r.name.indexOf(" · ");
  return i >= 0 ? r.name.slice(i + 3) : r.code;
}

function toOption(r: ResourceRow, kind: ResourceOption["kind"]): ResourceOption {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind,
    choiceLabel: kind === "full" ? "Full field" : kind === "part" ? choiceLabel(r) : r.name,
    description: r.description,
    priceCentsPerHour: r.priceCentsPerHour,
    slotMinutes: r.slotMinutes,
    minMinutes: r.minMinutes,
    maxMinutes: r.maxMinutes,
  };
}

function minimumLabel(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} hour minimum`;
  return `${minutes} minute minimum`;
}

function buildFieldGroups(map: UnitMap): FieldGroup[] {
  const active = map.resources.filter((r) => r.active);
  const groups = new Map<string, FieldCard[]>();
  for (const r of active) {
    if (r.parentId) continue;
    const children = (map.childrenOf.get(r.id) ?? []).filter((c) => c.active);
    const options = children.length
      ? [toOption(r, "full"), ...children.map((c) => toOption(c, "part"))]
      : [toOption(r, "single")];
    const n = children.length;
    const card: FieldCard = {
      id: r.id,
      code: r.code,
      name: r.name,
      groupLabel: r.groupLabel,
      surface: r.surface,
      indoor: r.indoor,
      description: r.description,
      fromPriceCentsPerHour: Math.min(...options.map((o) => o.priceCentsPerHour)),
      layout: n === 2 ? "split2" : n === 3 ? "split3" : n === 4 ? "split4" : "single",
      options,
    };
    const list = groups.get(r.groupLabel) ?? [];
    list.push(card);
    groups.set(r.groupLabel, list);
  }
  return [...groups.entries()].map(([label, cards]) => {
    let detail: string;
    if (cards.length === 1) {
      const c = cards[0];
      const minMinutes = c.options[0].minMinutes;
      detail = `${c.surface ?? "Field"}, ${c.indoor ? "indoors" : "outdoors"}. ${minimumLabel(minMinutes)}.`;
    } else {
      detail = cards.map((c) => c.name).join(", ");
      if (cards.some((c) => c.layout !== "single")) detail += ". Full or half.";
    }
    return {
      label,
      detail,
      fromPriceCentsPerHour: Math.min(...cards.map((c) => c.fromPriceCentsPerHour)),
      cards,
    };
  });
}

/** Landing + Choose field: groups of field cards with full/half options. */
export async function getFieldGroups(slug: string): Promise<FieldGroup[]> {
  const t = await tenantBySlug(slug);
  if (!t) return [];
  return withTenant(t.id, async (tx) => buildFieldGroups(await loadUnitMap(tx, t.id)));
}

/** Date strip: the next `days` facility-local dates from today. */
export async function getDateChips(slug: string, resourceId: string, days = 14): Promise<DateChip[]> {
  const t = await tenantBySlug(slug);
  if (!t || !isUuid(resourceId)) return [];
  const now = new Date();
  return withTenant(t.id, async (tx) => {
    const map = await loadUnitMap(tx, t.id);
    const resource = map.byId.get(resourceId);
    if (!resource) return [];
    return computeDateChips(tx, { tenant: t, map, hours: await loadHours(tx, t.id), resource, days, now });
  });
}

/**
 * Start times for one resource, date and duration. A slot is available
 * only when every unit the resource occupies is free for the whole
 * duration plus buffer, within hours, lead time and booking window.
 */
export async function getDayAvailability(
  slug: string,
  resourceId: string,
  date: string,
  durationMinutes: number,
): Promise<DayAvailability> {
  const t = await tenantBySlug(slug);
  if (!t) throw new Error("Facility not found");
  if (!isUuid(resourceId) || !isValidDate(date)) throw new Error("Invalid resource or date");
  const now = new Date();
  return withTenant(t.id, async (tx) => {
    const map = await loadUnitMap(tx, t.id);
    const resource = map.byId.get(resourceId);
    if (!resource) throw new Error("Resource not found");
    return computeDayAvailability(tx, {
      tenant: t,
      map,
      hours: await loadHours(tx, t.id),
      resource,
      date,
      durationMinutes,
      now,
    });
  });
}

/** Continue on Date and time: soft-hold the slot for checkoutHoldMinutes. */
export async function startCheckout(
  slug: string,
  input: { resourceId: string; startsAt: string; durationMinutes: number },
): Promise<StartCheckoutResult> {
  const t = await tenantBySlug(slug);
  if (!t) return { ok: false, error: "invalid" };
  if (!t.bookingsEnabled) return { ok: false, error: "bookings_off" };
  const start = new Date(input?.startsAt);
  if (!isUuid(input?.resourceId) || Number.isNaN(start.getTime())) return { ok: false, error: "invalid" };
  const now = new Date();
  const zone = t.timeZone;
  let toCancel: { bookingId: string; paymentIntentId: string | null }[] = [];
  try {
    const result = await withTenant(t.id, async (tx): Promise<StartCheckoutResult> => {
      const map = await loadUnitMap(tx, t.id);
      const resource = map.byId.get(input.resourceId);
      if (!resource || !resource.active) return { ok: false, error: "invalid" };
      if (!isValidDuration(resource, input.durationMinutes)) return { ok: false, error: "invalid" };
      const unitIds = map.unitsOf.get(resource.id) ?? [];
      if (!unitIds.length) return { ok: false, error: "invalid" };

      // Purge expired holds on these units first (constraints can't use now()).
      toCancel = await abandonExpiredCheckouts(tx, t.id, now, unitIds);

      const day = await computeDayAvailability(tx, {
        tenant: t,
        map,
        hours: await loadHours(tx, t.id),
        resource,
        date: localDate(start, zone),
        durationMinutes: input.durationMinutes,
        now,
      });
      const slot = day.slots.find((s) => new Date(s.startsAt).getTime() === start.getTime());
      if (!slot) {
        if (day.closed) return { ok: false, error: "closed" };
        if (day.dayReason === "too_far") return { ok: false, error: "too_far" };
        if (day.dayReason === "too_soon") return { ok: false, error: "too_soon" };
        return { ok: false, error: "outside_hours" };
      }
      if (!slot.available) {
        const map_: Record<string, StartCheckoutError> = {
          taken: "slot_taken",
          closed: "closed",
          too_soon: "too_soon",
          too_far: "too_far",
          outside_hours: "outside_hours",
        };
        return { ok: false, error: map_[slot.reason ?? "taken"] ?? "slot_taken" };
      }

      const end = new Date(slot.endsAt);
      const expiresAt = new Date(now.getTime() + t.checkoutHoldMinutes * MINUTE);
      const checkoutToken = randomToken();
      const [booking] = await tx
        .insert(bookings)
        .values({
          tenantId: t.id,
          resourceId: resource.id,
          status: "checking_out",
          startsAt: start,
          endsAt: end,
          priceCents: slot.priceCents,
          checkoutToken,
          checkoutExpiresAt: expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: bookings.id });
      const occupiedUntil = new Date(end.getTime() + resource.bufferMinutes * MINUTE);
      await tx.insert(unitOccupancy).values(
        unitIds.map((unitId) => ({
          tenantId: t.id,
          unitId,
          during: rangeLiteral(start, occupiedUntil),
          kind: "hold" as const,
          bookingId: booking.id,
          holdExpiresAt: expiresAt,
        })),
      );
      await writeAudit(tx, {
        tenantId: t.id,
        actorType: "customer",
        action: "booking.hold",
        targetType: "booking",
        targetId: booking.id,
        at: now,
      });
      return {
        ok: true,
        hold: {
          bookingId: booking.id,
          checkoutToken,
          expiresAt: expiresAt.toISOString(),
          resourceId: resource.id,
          resourceName: resource.name,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          whenLabel: checkoutWhenLabel(start, end, zone),
          priceCents: slot.priceCents,
        },
      };
    });
    return result;
  } catch (err) {
    toCancel = []; // rolled back
    // Two customers, one slot: the second insert hits the exclusion constraint.
    if (isExclusionViolation(err)) return { ok: false, error: "slot_taken" };
    throw err;
  } finally {
    for (const c of toCancel) await cancelPaymentQuietly(t.stripeAccountId, c.paymentIntentId, c.bookingId);
  }
}

async function bookingByCheckoutToken(tx: Tx, tenantId: string, token: string): Promise<BookingRow | null> {
  if (typeof token !== "string" || token.length < 16) return null;
  const [b] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.checkoutToken, token)))
    .limit(1);
  return b ?? null;
}

async function holdIsLive(tx: Tx, b: BookingRow, now: Date): Promise<boolean> {
  if (b.status !== "checking_out" || !b.checkoutExpiresAt || b.checkoutExpiresAt <= now) return false;
  return (await liveHoldCount(tx, b.tenantId, b.id, now)) > 0;
}

/** Abandon one checkout inside tx; returns true if it changed state. */
async function abandonOne(tx: Tx, b: BookingRow, now: Date, reason: string): Promise<boolean> {
  await deleteOccupancy(tx, b.tenantId, b.id);
  if (b.status !== "checking_out") return false;
  await tx
    .update(bookings)
    .set({
      status: "abandoned",
      paymentStatus: b.paymentIntentId ? "canceled" : b.paymentStatus,
      checkoutExpiresAt: null,
      ...bump(now),
    })
    .where(eq(bookings.id, b.id));
  await writeAudit(tx, {
    tenantId: b.tenantId,
    actorType: "customer",
    actorId: b.customerId,
    action: "booking.abandon",
    targetType: "booking",
    targetId: b.id,
    reason,
    at: now,
  });
  return true;
}

type FieldErrors = Partial<Record<keyof CustomerDetailsInput, string>>;

/** Your details: customer, team, waiver acceptance (time + version). */
export async function saveCheckoutDetails(
  slug: string,
  checkoutToken: string,
  details: CustomerDetailsInput,
): Promise<SaveDetailsResult> {
  const t = await tenantBySlug(slug);
  if (!t) return { ok: false, error: "invalid" };
  const now = new Date();

  const fieldErrors: FieldErrors = {};
  const name = (details?.name ?? "").trim().slice(0, 120);
  const email = normalizeEmail(details?.email ?? "");
  const phone = normalizePhone(details?.phone ?? "");
  const team = (details?.team ?? "").trim().slice(0, 120) || null;
  if (!name) fieldErrors.name = "Enter your name.";
  if (!phone) fieldErrors.phone = "Enter a 10-digit phone number.";
  if (!isEmail(email)) fieldErrors.email = "Enter an email address, like name@example.com.";
  if (details?.waiverAccepted !== true) fieldErrors.waiverAccepted = "Check the box to accept the waiver.";

  return withTenant(t.id, async (tx): Promise<SaveDetailsResult> => {
    const b = await bookingByCheckoutToken(tx, t.id, checkoutToken);
    if (!b || !(await holdIsLive(tx, b, now))) return { ok: false, error: "hold_expired" };
    if (Object.keys(fieldErrors).length) return { ok: false, error: "invalid", fieldErrors };

    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, t.id), eq(customers.email, email)))
      .limit(1);
    let customerId: string;
    if (existing) {
      customerId = existing.id;
      await tx.update(customers).set({ name, phone: phone! }).where(eq(customers.id, existing.id));
    } else {
      const [c] = await tx
        .insert(customers)
        .values({ tenantId: t.id, name, email, phone: phone!, createdAt: now })
        .returning({ id: customers.id });
      customerId = c.id;
    }
    await tx
      .update(bookings)
      .set({ customerId, team, waiverAcceptedAt: now, waiverVersion: t.waiverVersion, ...bump(now) })
      .where(eq(bookings.id, b.id));
    return { ok: true };
  });
}

function paymentDescription(resource: ResourceRow | null, b: BookingRow, zone: string): string {
  return `${resource?.code ?? "Booking"} · ${checkoutWhenLabel(b.startsAt, b.endsAt, zone)}`;
}

/** Create (or re-fetch) the manual-capture payment for a checkout. Call outside a transaction. */
async function ensurePaymentHold(
  t: TenantRow,
  b: BookingRow,
): Promise<{ ok: true; paymentIntentId: string; clientSecret: string | null } | { ok: false; message: string }> {
  const provider = await getPaymentProvider();
  if (provider.mode === "stripe" && !t.stripeAccountId) return { ok: false, message: "Payouts are not set up for this facility." };
  const details = await withTenant(t.id, async (tx) => {
    const resource = await getResource(tx, t.id, b.resourceId);
    const [c] = b.customerId
      ? await tx.select().from(customers).where(eq(customers.id, b.customerId)).limit(1)
      : [];
    return { resource, customer: c ?? null };
  });
  const fee = applicationFeeCents(b.priceCents, env.tymoFeeBps);
  let created: { paymentIntentId: string; clientSecret: string | null };
  try {
    created = await provider.createHold({
      stripeAccountId: t.stripeAccountId,
      amountCents: b.priceCents,
      currency: b.currency,
      applicationFeeCents: fee,
      description: paymentDescription(details.resource, b, t.timeZone),
      receiptEmail: details.customer?.email,
      metadata: { tenant_id: t.id, booking_id: b.id },
      idempotencyKey: `hold-${b.id}`,
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Payment setup failed" };
  }
  if (b.paymentIntentId !== created.paymentIntentId) {
    await withTenant(t.id, async (tx) => {
      await tx
        .update(bookings)
        .set({
          paymentIntentId: created.paymentIntentId,
          applicationFeeCents: fee,
          paymentStatus: "pending",
          ...bump(new Date()),
        })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, "checking_out")));
    });
  }
  return { ok: true, ...created };
}

/** Payment step: create the manual-capture payment on the facility's account. */
export async function preparePayment(slug: string, checkoutToken: string): Promise<PreparePaymentResult> {
  const t = await tenantBySlug(slug);
  if (!t) return { ok: false, error: "hold_expired" };
  const now = new Date();
  const b = await withTenant(t.id, async (tx) => {
    const row = await bookingByCheckoutToken(tx, t.id, checkoutToken);
    if (!row || !(await holdIsLive(tx, row, now))) return null;
    return row;
  });
  if (!b) return { ok: false, error: "hold_expired" };
  if (!b.customerId || !b.waiverAcceptedAt) return { ok: false, error: "missing_details" };
  const hold = await ensurePaymentHold(t, b);
  if (!hold.ok) return { ok: false, error: "payment_error", message: hold.message };
  const provider = await getPaymentProvider();
  if (provider.mode === "stripe") {
    if (!hold.clientSecret || !t.stripeAccountId) return { ok: false, error: "payment_error", message: "No client secret" };
    return { ok: true, mode: "stripe", clientSecret: hold.clientSecret, stripeAccountId: t.stripeAccountId };
  }
  return { ok: true, mode: "fake" };
}

/**
 * Send request: verify the hold is still ours, verify the card is
 * authorized (Stripe: PaymentIntent requires_capture; fake: simulate),
 * move to `requested`, set the approval deadline, mint the private link,
 * and notify the customer and staff. Idempotent per checkout token.
 */
export async function submitRequest(slug: string, input: SubmitRequestInput): Promise<SubmitRequestResult> {
  const t = await tenantBySlug(slug);
  if (!t) return { ok: false, error: "invalid" };
  const now = new Date();

  type Pre =
    | { kind: "done"; result: SubmitRequestResult }
    | { kind: "expired"; b: BookingRow }
    | { kind: "go"; b: BookingRow };
  const pre = await withTenant(t.id, async (tx): Promise<Pre> => {
    const b = await bookingByCheckoutToken(tx, t.id, input?.checkoutToken);
    if (!b) return { kind: "done", result: { ok: false, error: "invalid" } };
    if (b.status !== "checking_out") {
      if (b.publicToken) return { kind: "done", result: { ok: false, error: "already_submitted", publicToken: b.publicToken } };
      return { kind: "done", result: { ok: false, error: "hold_expired" } };
    }
    if (!(await holdIsLive(tx, b, now))) {
      await abandonOne(tx, b, now, "Checkout hold expired before Send request");
      return { kind: "expired", b };
    }
    if (!b.customerId || !b.waiverAcceptedAt) {
      return { kind: "done", result: { ok: false, error: "invalid", message: "Add your details first." } };
    }
    return { kind: "go", b };
  });
  if (pre.kind === "done") return pre.result;
  if (pre.kind === "expired") {
    await cancelPaymentQuietly(t.stripeAccountId, pre.b.paymentIntentId, pre.b.id);
    return { ok: false, error: "hold_expired" };
  }
  const b = pre.b;

  const provider = await getPaymentProvider();
  let paymentIntentId = b.paymentIntentId;
  if (!paymentIntentId) {
    const hold = await ensurePaymentHold(t, b);
    if (!hold.ok) return { ok: false, error: "payment_error", message: hold.message };
    paymentIntentId = hold.paymentIntentId;
  }

  let info: HoldInfo;
  try {
    if (provider.mode === "fake" && provider.simulateConfirm && typeof input.fakeCardNumber === "string") {
      info = await provider.simulateConfirm({ paymentIntentId, cardNumber: input.fakeCardNumber });
    } else {
      info = await provider.getHold({ stripeAccountId: t.stripeAccountId, paymentIntentId });
    }
  } catch (err) {
    return { ok: false, error: "payment_error", message: err instanceof Error ? err.message : "Payment check failed" };
  }
  if (info.status !== "authorized") {
    // The booking stays checking_out so the customer can retry with another card.
    if (info.status === "failed" || (info.status === "requires_payment_method" && info.declineMessage)) {
      return { ok: false, error: "card_declined", message: info.declineMessage ?? "Your card was declined." };
    }
    if (info.status === "requires_payment_method" || info.status === "requires_action") {
      return { ok: false, error: "card_not_confirmed" };
    }
    return { ok: false, error: "payment_error", message: `Payment is ${info.status}` };
  }

  const captureBefore = info.captureBefore ? new Date(info.captureBefore) : null;
  const publicToken = randomToken();
  const outcome = await withTenant(t.id, async (tx): Promise<SubmitRequestResult | "expired"> => {
    const locked = await lockBooking(tx, t.id, b.id);
    if (!locked) return { ok: false, error: "invalid" };
    if (locked.status !== "checking_out") {
      if (locked.publicToken) return { ok: false, error: "already_submitted", publicToken: locked.publicToken };
      return "expired";
    }
    if (!(await holdIsLive(tx, locked, now))) {
      // A staff block removed the hold (or it timed out) while the card was being confirmed.
      await abandonOne(tx, locked, now, "Checkout hold removed before Send request");
      return "expired";
    }
    const deadline = approvalDeadline(t, now, locked.startsAt, captureBefore);
    await tx
      .update(unitOccupancy)
      .set({ kind: "booking", holdExpiresAt: null })
      .where(and(eq(unitOccupancy.tenantId, t.id), eq(unitOccupancy.bookingId, locked.id)));
    await tx
      .update(bookings)
      .set({
        status: "requested",
        paymentStatus: "authorized",
        paymentIntentId,
        cardBrand: info.cardBrand,
        cardLast4: info.cardLast4,
        captureBefore,
        approvalDeadlineAt: deadline,
        publicToken,
        checkoutExpiresAt: null,
        ...bump(now),
      })
      .where(eq(bookings.id, locked.id));
    await writeAudit(tx, {
      tenantId: t.id,
      actorType: "customer",
      actorId: locked.customerId,
      action: "booking.request",
      targetType: "booking",
      targetId: locked.id,
      data: { priceCents: locked.priceCents, approvalDeadlineAt: deadline.toISOString() },
      at: now,
    });
    return { ok: true, bookingId: locked.id, publicToken, approvalDeadlineAt: deadline.toISOString() };
  });
  if (outcome === "expired") {
    await cancelPaymentQuietly(t.stripeAccountId, paymentIntentId, b.id);
    return { ok: false, error: "hold_expired" };
  }
  if (outcome.ok) {
    await safeNotify(t.id, { kind: "request_received", bookingId: b.id });
    await safeNotify(t.id, { kind: "staff_new_request", bookingId: b.id });
  }
  return outcome;
}

/** Leave checkout early (Back to fields): release the hold and cancel any payment. */
export async function abandonCheckout(slug: string, checkoutToken: string): Promise<void> {
  const t = await tenantBySlug(slug);
  if (!t) return;
  const now = new Date();
  const released = await withTenant(t.id, async (tx) => {
    const b = await bookingByCheckoutToken(tx, t.id, checkoutToken);
    if (!b || b.status !== "checking_out") return null;
    const locked = await lockBooking(tx, t.id, b.id);
    if (!locked || locked.status !== "checking_out") return null;
    await abandonOne(tx, locked, now, "Customer left checkout");
    return locked;
  });
  if (released) await cancelPaymentQuietly(t.stripeAccountId, released.paymentIntentId, released.id);
}

async function bookingByPublicToken(tx: Tx, tenantId: string, token: string): Promise<BookingRow | null> {
  if (typeof token !== "string" || token.length < 16) return null;
  const [b] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.publicToken, token)))
    .limit(1);
  return b ?? null;
}

function cancelCutoff(t: TenantRow, b: BookingRow): Date {
  return new Date(b.startsAt.getTime() - t.cancelCutoffMinutes * MINUTE);
}

/** The customer's private booking page. null if the token is unknown or expired. */
export async function getBookingByToken(slug: string, publicToken: string): Promise<BookingPublicView | null> {
  const t = await tenantBySlug(slug);
  if (!t) return null;
  const now = new Date();
  return withTenant(t.id, async (tx) => {
    const b = await bookingByPublicToken(tx, t.id, publicToken);
    if (!b) return null;
    if (now.getTime() > b.endsAt.getTime() + 30 * DAY) return null;
    const resource = await getResource(tx, t.id, b.resourceId);
    const [c] = b.customerId ? await tx.select().from(customers).where(eq(customers.id, b.customerId)).limit(1) : [];
    const zone = t.timeZone;
    const cutoff = cancelCutoff(t, b);
    const remaining = b.amountCapturedCents - b.amountRefundedCents;
    let cancelMode: BookingPublicView["cancelMode"] = "none";
    if (b.status === "requested") cancelMode = "request";
    else if (b.status === "approved") cancelMode = now < cutoff ? "refund" : "call";
    return {
      bookingId: b.id,
      facility: toFacilityPublic(t, now),
      status: b.status,
      statusLabel: customerStatusLabel(b.status),
      resourceName: resource?.name ?? "",
      whenLabel: longWhenLabel(b.startsAt, b.endsAt, zone),
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      priceCents: b.priceCents,
      amountRefundedCents: b.amountRefundedCents,
      cardLabel: formatCard(b.cardBrand, b.cardLast4),
      customerName: c?.name ?? "",
      customerEmail: c?.email ?? "",
      team: b.team,
      approvalDeadlineLabel: b.status === "requested" && b.approvalDeadlineAt ? atLabel(b.approvalDeadlineAt, zone) : null,
      freeCancelUntilLabel: cutoff > b.createdAt ? atLabel(cutoff, zone) : null,
      declineReason: b.declineReason,
      cancelReason: b.cancelReason,
      cancelMode,
      refundIfCancelledCents: cancelMode === "refund" ? Math.max(0, remaining) : 0,
    };
  });
}

/** Cancel from the private link: release (requested) or refund per policy (approved). */
export async function cancelByToken(slug: string, publicToken: string): Promise<CancelByTokenResult> {
  const t = await tenantBySlug(slug);
  if (!t) return { ok: false, error: "not_found" };
  const now = new Date();
  const provider = await getPaymentProvider();
  const result = await withTenant(t.id, async (tx): Promise<CancelByTokenResult & { bookingId?: string }> => {
    const found = await bookingByPublicToken(tx, t.id, publicToken);
    if (!found) return { ok: false, error: "not_found" };
    const b = await lockBooking(tx, t.id, found.id);
    if (!b) return { ok: false, error: "not_found" };
    if (b.status === "requested") {
      if (b.paymentIntentId) {
        try {
          await provider.cancel({ stripeAccountId: t.stripeAccountId, paymentIntentId: b.paymentIntentId, idempotencyKey: `cancel-${b.id}` });
        } catch {
          return { ok: false, error: "payment_error" };
        }
      }
      await deleteOccupancy(tx, t.id, b.id);
      await tx
        .update(bookings)
        .set({
          status: "cancelled_by_customer",
          paymentStatus: b.paymentIntentId ? "canceled" : b.paymentStatus,
          cancelledAt: now,
          ...bump(now),
        })
        .where(eq(bookings.id, b.id));
      await writeAudit(tx, {
        tenantId: t.id,
        actorType: "customer",
        actorId: b.customerId,
        action: "booking.cancel_customer",
        targetType: "booking",
        targetId: b.id,
        data: { refundCents: 0 },
        at: now,
      });
      return { ok: true, status: "cancelled_by_customer", refundedCents: 0, bookingId: b.id };
    }
    if (b.status === "approved") {
      if (now >= cancelCutoff(t, b)) return { ok: false, error: "past_cutoff" };
      const amount = Math.max(0, b.amountCapturedCents - b.amountRefundedCents);
      if (amount > 0 && b.paymentIntentId) {
        await ensureFakeCaptured(t.stripeAccountId, b.paymentIntentId, b.id);
        const refund = await provider
          .refund({
            stripeAccountId: t.stripeAccountId,
            paymentIntentId: b.paymentIntentId,
            amountCents: amount,
            refundApplicationFee: true,
            idempotencyKey: `refund-${b.id}-customer`,
          })
          .catch((err: unknown) => ({ ok: false as const, reason: String(err) }));
        if (!refund.ok) return { ok: false, error: "payment_error" };
      }
      await deleteOccupancy(tx, t.id, b.id);
      await tx
        .update(bookings)
        .set({
          status: "cancelled_by_customer",
          paymentStatus: amount > 0 ? "refunded" : b.paymentStatus,
          amountRefundedCents: b.amountRefundedCents + amount,
          cancelledAt: now,
          ...bump(now),
        })
        .where(eq(bookings.id, b.id));
      await writeAudit(tx, {
        tenantId: t.id,
        actorType: "customer",
        actorId: b.customerId,
        action: "booking.cancel_customer",
        targetType: "booking",
        targetId: b.id,
        data: { refundCents: amount },
        at: now,
      });
      return { ok: true, status: "cancelled_by_customer", refundedCents: amount, bookingId: b.id };
    }
    return { ok: false, error: "not_cancellable" };
  });
  if (result.ok && result.bookingId) {
    await safeNotify(t.id, { kind: "cancelled_by_customer", bookingId: result.bookingId });
    await safeNotify(t.id, { kind: "staff_customer_cancelled", bookingId: result.bookingId });
  }
  if (result.ok) return { ok: true, status: result.status, refundedCents: result.refundedCents };
  return result;
}

