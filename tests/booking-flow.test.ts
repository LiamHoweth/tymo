import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/email/notify", () => ({ notify: vi.fn(async () => {}) }));

import { and, eq, sql } from "drizzle-orm";
import { notify } from "@/server/email/notify";
import { bookings, unitOccupancy } from "@/server/db/schema";
import { applicationFeeCents } from "@/server/payments/fees";
import { fakePaymentProvider, fakeVoidHold } from "@/server/payments/fake";
import {
  cancelByToken,
  getBookingByToken,
  getDateChips,
  getDayAvailability,
  getFacility,
  getFieldGroups,
  saveCheckoutDetails,
  startCheckout,
  submitRequest,
} from "@/server/booking/public";
import { approveBooking, cancelBooking, createBlock, declineBooking, getApprovalQueue, getBookingDetail } from "@/server/booking/staff";
import { runSweep } from "@/server/booking/jobs";
import { checkoutToCard, DECLINE_CARD, GOOD_CARD, local, ownerCtx, requestBooking, SAM, staffCtx } from "./helpers/booking";
import { resetAndSeed, setupTestDb, teardownTestDb, type DbHandle, type SeedResult } from "./helpers/db";

// Tue Dec 1 2026, 9:00 AM Central.
const NOW = new Date("2026-12-01T15:00:00Z");
const SAT = "2026-12-05";

let h: DbHandle;
let seeded: SeedResult;

beforeAll(async () => {
  h = await setupTestDb();
});
beforeEach(async () => {
  vi.setSystemTime(NOW);
  vi.mocked(notify).mockClear();
  seeded = await resetAndSeed(h, { now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await teardownTestDb(h);
});

const notified = (kind: string) => vi.mocked(notify).mock.calls.filter(([, e]) => e.kind === kind);

async function bookingRow(id: string) {
  const [b] = await h.db.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

async function occupancyCount(bookingId: string) {
  const [r] = await h.db
    .select({ n: sql<number>`count(*)::int` })
    .from(unitOccupancy)
    .where(eq(unitOccupancy.bookingId, bookingId));
  return Number(r.n);
}

function slotAt(day: { slots: { startsAt: string; available: boolean; reason?: string }[] }, at: Date) {
  return day.slots.find((s) => s.startsAt === at.toISOString());
}

describe("facility and fields", () => {
  it("returns the branded facility and grouped fields", async () => {
    const f = await getFacility("redbud");
    expect(f?.name).toBe("Redbud Soccer Complex");
    expect(f?.timeZoneLabel).toBe("CT");
    expect(f?.brand.primary).toBe("#12305f");
    expect(await getFacility("nope")).toBeNull();

    const groups = await getFieldGroups("redbud");
    const cards = groups.flatMap((g) => g.cards);
    expect(groups.map((g) => g.label)).toEqual(["Indoor", "Grass fields", "Turf fields"]);
    expect(cards).toHaveLength(11);
    expect(cards.flatMap((c) => c.options)).toHaveLength(23);
    const n1 = cards.find((c) => c.code === "N1")!;
    expect(n1.layout).toBe("split2");
    expect(n1.options.map((o) => o.choiceLabel)).toEqual(["Full field", "Half A", "Half B"]);
    expect(groups.find((g) => g.label === "Grass fields")!.fromPriceCentsPerHour).toBe(3000);
  });

  it("offers 30-minute starts inside hours with lead time, window and price", async () => {
    const day = await getDayAvailability("redbud", seeded.redbud.resources.Indoor, SAT, 90);
    expect(day.closed).toBe(false);
    expect(day.slots[0].startLocal).toBe("9:00 AM");
    expect(day.slots[day.slots.length - 1].startLocal).toBe("7:30 PM"); // 7:30 + 1.5 h = 9:00 PM close
    expect(day.slots.every((s) => s.available)).toBe(true);
    expect(day.slots[0].priceCents).toBe(12000);
    expect(day.slots.find((s) => s.startLocal === "5:00 PM")!.period).toBe("Evening");

    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000)); // 9:10 AM: tomorrow 9:00 is under 24 h away
    const tomorrow = await getDayAvailability("redbud", seeded.redbud.resources.Indoor, "2026-12-02", 60);
    expect(slotAt(tomorrow, local("2026-12-02", "09:00"))!.reason).toBe("too_soon");
    expect(slotAt(tomorrow, local("2026-12-02", "09:30"))!.available).toBe(true);

    const far = await getDayAvailability("redbud", seeded.redbud.resources.Indoor, "2027-02-15", 60);
    expect(far.dayReason).toBe("too_far");

    const chips = await getDateChips("redbud", seeded.redbud.resources.Indoor);
    expect(chips).toHaveLength(14);
    expect(chips[0]).toMatchObject({ date: "2026-12-01", bookable: false, label: "Tue Dec 1" });
    expect(chips[1].bookable).toBe(true);
  });
});

describe("acceptance tests", () => {
  it("2 + 3: a requested half blocks the full field but not the other half", async () => {
    const r = seeded.redbud;
    await requestBooking(r, "N1A", SAT, "10:00", 60);

    const full = await getDayAvailability("redbud", r.resources.N1, SAT, 60);
    for (const t of ["09:30", "10:00", "10:30"]) expect(slotAt(full, local(SAT, t))).toMatchObject({ available: false, reason: "taken" });
    expect(slotAt(full, local(SAT, "09:00"))!.available).toBe(true);
    expect(slotAt(full, local(SAT, "11:00"))!.available).toBe(true);

    const other = await getDayAvailability("redbud", r.resources.N1B, SAT, 60);
    expect(slotAt(other, local(SAT, "10:00"))!.available).toBe(true);
    const res = await requestBooking(r, "N1B", SAT, "10:00", 60, SAM);
    expect(res.ok).toBe(true);
  });

  it("4: two holds on one unit: one proceeds, the other is told the slot was taken", async () => {
    const r = seeded.redbud;
    const input = { resourceId: r.resources.N2A, startsAt: local(SAT, "13:00").toISOString(), durationMinutes: 60 };
    const [a, b] = await Promise.all([startCheckout("redbud", input), startCheckout("redbud", input)]);
    const oks = [a, b].filter((x) => x.ok);
    const fails = [a, b].filter((x) => !x.ok);
    expect(oks).toHaveLength(1);
    expect(fails[0]).toEqual({ ok: false, error: "slot_taken" });
    // The full field shares the unit and is refused too.
    const full = await startCheckout("redbud", { ...input, resourceId: r.resources.N2 });
    expect(full).toEqual({ ok: false, error: "slot_taken" });
  });

  it("4: the database itself rejects overlapping occupancy (SQLSTATE 23P01)", async () => {
    const r = seeded.redbud;
    const { hold } = await checkoutToCard(r, "N3A", SAT, "15:00");
    const err = await h.db
      .insert(unitOccupancy)
      .values({
        tenantId: r.tenantId,
        unitId: r.units["N3-a"],
        during: `[${local(SAT, "15:30").toISOString()},${local(SAT, "16:30").toISOString()})`,
        kind: "hold",
        bookingId: hold.bookingId,
      })
      .then(() => null)
      .catch((e: unknown) => e as { cause?: { code?: string }; code?: string });
    expect(err?.cause?.code ?? err?.code).toBe("23P01");
  });

  it("5: a staff block removes the checkout hold and Send request is refused", async () => {
    const r = seeded.redbud;
    const { hold, checkoutToken } = await checkoutToCard(r, "C1", SAT, "11:00");
    const blocked = await createBlock(staffCtx(r), {
      kind: "one_time",
      label: "Phone booking, paid cash",
      resourceId: r.resources.C1,
      date: SAT,
      startLocal: "10:00",
      endLocal: "13:00",
    });
    expect(blocked.ok).toBe(true);
    const res = await submitRequest("redbud", { checkoutToken, fakeCardNumber: GOOD_CARD });
    expect(res).toMatchObject({ ok: false, error: "hold_expired" });
    const b = await bookingRow(hold.bookingId);
    expect(b.status).toBe("abandoned");
    const info = await fakePaymentProvider.getHold({ stripeAccountId: null, paymentIntentId: b.paymentIntentId! });
    expect(info.status).toBe("canceled");
  });

  it("5: after 10 minutes the hold is gone and Send request is refused with no authorization", async () => {
    const r = seeded.redbud;
    const { hold, checkoutToken } = await checkoutToCard(r, "C2", SAT, "11:00");
    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000));
    const res = await submitRequest("redbud", { checkoutToken, fakeCardNumber: GOOD_CARD });
    expect(res).toMatchObject({ ok: false, error: "hold_expired" });
    const b = await bookingRow(hold.bookingId);
    expect(b.status).toBe("abandoned");
    expect(await occupancyCount(b.id)).toBe(0);
    expect((await fakePaymentProvider.getHold({ stripeAccountId: null, paymentIntentId: b.paymentIntentId! })).status).toBe("canceled");
    // Someone else can now take it.
    expect((await startCheckout("redbud", { resourceId: r.resources.C2, startsAt: local(SAT, "11:00").toISOString(), durationMinutes: 60 })).ok).toBe(true);
  });

  it("submit is idempotent per checkout token", async () => {
    const r = seeded.redbud;
    const { checkoutToken } = await checkoutToCard(r, "C3", SAT, "09:00");
    const first = await submitRequest("redbud", { checkoutToken, fakeCardNumber: GOOD_CARD });
    const second = await submitRequest("redbud", { checkoutToken, fakeCardNumber: GOOD_CARD });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, error: "already_submitted", publicToken: first.ok ? first.publicToken : "" });
    expect(notified("request_received")).toHaveLength(1);
    expect(notified("staff_new_request")).toHaveLength(1);
  });

  it("6: approving twice captures once, for the exact amount", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "Indoor", SAT, "17:00", 90);
    const capture = vi.spyOn(fakePaymentProvider, "capture");
    const [a, b] = await Promise.all([approveBooking(staffCtx(r), req.bookingId), approveBooking(ownerCtx(r), req.bookingId)]);
    const results = [a, b];
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    const dup = results.find((x) => !x.ok)!;
    expect(dup).toMatchObject({ ok: false, error: "already_handled" });
    expect(dup.ok ? "" : dup.message).toMatch(/approved this at/);
    expect(capture).toHaveBeenCalledTimes(1);
    const row = await bookingRow(req.bookingId);
    expect(row.status).toBe("approved");
    expect(row.paymentStatus).toBe("captured");
    expect(row.amountCapturedCents).toBe(12000);
    expect(row.version).toBeGreaterThan(0);
    expect(notified("approved")).toHaveLength(1);
    const detail = await getBookingDetail(ownerCtx(r), req.bookingId);
    expect(detail!.history.map((x) => x.action)).toEqual(["Checkout started", "Request sent", "Approved and charged $120.00"]);
    expect(detail!.tymoFeeCents).toBe(240);
    expect((await getBookingDetail(staffCtx(r), req.bookingId))!.tymoFeeCents).toBeNull();
  });

  it("7: decline releases the hold, records the reason and reopens the slot", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "S1", SAT, "12:00", 60);
    const res = await declineBooking(staffCtx(r), req.bookingId, "Field is set up for a tournament.");
    expect(res).toMatchObject({ ok: true, status: "declined" });
    const row = await bookingRow(req.bookingId);
    expect(row.declineReason).toBe("Field is set up for a tournament.");
    expect(row.paymentStatus).toBe("canceled");
    expect((await fakePaymentProvider.getHold({ stripeAccountId: null, paymentIntentId: row.paymentIntentId! })).status).toBe("canceled");
    const day = await getDayAvailability("redbud", r.resources.S1, SAT, 60);
    expect(slotAt(day, local(SAT, "12:00"))!.available).toBe(true);
    expect(notified("declined")).toHaveLength(1);
    expect((await approveBooking(ownerCtx(r), req.bookingId)).ok).toBe(false);
  });

  it("8: the sweep expires overdue requests, releases holds and reopens the slot", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "S2", SAT, "14:00", 60);
    const queue = await getApprovalQueue(staffCtx(r));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ resourceCode: "S2", expiresInLabel: "2 days", urgent: false, waiverAccepted: true });
    expect(req.approvalDeadlineAt).toBe(new Date(NOW.getTime() + 48 * 3600_000).toISOString());

    // A checkout hold that will lapse during the same sweep.
    const { hold } = await checkoutToCard(r, "S3", SAT, "14:00");

    const reminder = await runSweep(new Date(NOW.getTime() + 25 * 3600_000));
    expect(reminder.remindersSent).toBe(1);
    expect(reminder.holdsReleased).toBe(1);
    expect((await bookingRow(hold.bookingId)).status).toBe("abandoned");

    const report = await runSweep(new Date(NOW.getTime() + 48 * 3600_000 + 60_000));
    expect(report.requestsExpired).toBe(1);
    const row = await bookingRow(req.bookingId);
    expect(row.status).toBe("expired");
    expect(row.remindersSent).toEqual([24]);
    expect(await occupancyCount(req.bookingId)).toBe(0);
    expect((await fakePaymentProvider.getHold({ stripeAccountId: null, paymentIntentId: row.paymentIntentId! })).status).toBe("canceled");
    expect(notified("expired")).toHaveLength(1);
    expect(notified("staff_request_expired")).toHaveLength(1);
    const day = await getDayAvailability("redbud", r.resources.S2, SAT, 60);
    expect(slotAt(day, local(SAT, "14:00"))!.available).toBe(true);
  });

  it("9: a declined card keeps the checkout open and a retry works", async () => {
    const r = seeded.redbud;
    const { hold, checkoutToken } = await checkoutToCard(r, "N2B", SAT, "16:00");
    const declined = await submitRequest("redbud", { checkoutToken, fakeCardNumber: DECLINE_CARD });
    expect(declined).toMatchObject({ ok: false, error: "card_declined", message: "Your card was declined." });
    expect((await bookingRow(hold.bookingId)).status).toBe("checking_out");
    const retry = await submitRequest("redbud", { checkoutToken, fakeCardNumber: GOOD_CARD });
    expect(retry.ok).toBe(true);
    const row = await bookingRow(hold.bookingId);
    expect(row.status).toBe("requested");
    expect(row.cardLast4).toBe("4242");
  });

  it("10: a voided hold at approval becomes payment_failed and the slot reopens", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "C1", SAT, "15:00", 60);
    fakeVoidHold((await bookingRow(req.bookingId)).paymentIntentId!);
    const res = await approveBooking(staffCtx(r), req.bookingId);
    expect(res).toMatchObject({ ok: false, error: "capture_failed" });
    const row = await bookingRow(req.bookingId);
    expect(row.status).toBe("payment_failed");
    expect(row.amountCapturedCents).toBe(0);
    expect(await occupancyCount(req.bookingId)).toBe(0);
    expect(notified("payment_failed")).toHaveLength(1);
    const view = await getBookingByToken("redbud", req.publicToken);
    expect(view).toMatchObject({ statusLabel: "Not booked", cancelMode: "none" });
    const day = await getDayAvailability("redbud", r.resources.C1, SAT, 60);
    expect(slotAt(day, local(SAT, "15:00"))!.available).toBe(true);
  });

  it("11: cancelling a request from the private link releases the hold with no charge", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "Champ", SAT, "10:00", 120);
    const view = await getBookingByToken("redbud", req.publicToken);
    expect(view).toMatchObject({ statusLabel: "Requested", cancelMode: "request", priceCents: 18000, refundIfCancelledCents: 0 });
    expect(view!.whenLabel).toBe("Saturday, December 5, 10:00 AM to 12:00 PM CT");
    expect(view!.approvalDeadlineLabel).toBe("Thu, Dec 3 at 9:00 AM CT");
    const res = await cancelByToken("redbud", req.publicToken);
    expect(res).toEqual({ ok: true, status: "cancelled_by_customer", refundedCents: 0 });
    const row = await bookingRow(req.bookingId);
    expect(row.paymentStatus).toBe("canceled");
    expect(row.amountCapturedCents).toBe(0);
    expect((await fakePaymentProvider.getHold({ stripeAccountId: null, paymentIntentId: row.paymentIntentId! })).status).toBe("canceled");
    expect(notified("cancelled_by_customer")).toHaveLength(1);
    expect(notified("staff_customer_cancelled")).toHaveLength(1);
    expect((await cancelByToken("redbud", req.publicToken)).ok).toBe(false);
  });

  it("12: cancelling after approval refunds in full before the cutoff and refuses after", async () => {
    const r = seeded.redbud;
    const early = await requestBooking(r, "N3", "2026-12-04", "18:00", 60); // 3 days out
    const late = await requestBooking(r, "N3", "2026-12-02", "16:00", 60, SAM); // ~1 day out
    expect((await approveBooking(ownerCtx(r), early.bookingId)).ok).toBe(true);
    expect((await approveBooking(ownerCtx(r), late.bookingId)).ok).toBe(true);

    const earlyView = await getBookingByToken("redbud", early.publicToken);
    expect(earlyView).toMatchObject({ statusLabel: "Booked", cancelMode: "refund", refundIfCancelledCents: 6000 });
    expect(earlyView!.freeCancelUntilLabel).toBe("Wed, Dec 2 at 6:00 PM CT");
    const refund = vi.spyOn(fakePaymentProvider, "refund");
    const res = await cancelByToken("redbud", early.publicToken);
    expect(res).toEqual({ ok: true, status: "cancelled_by_customer", refundedCents: 6000 });
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 6000, refundApplicationFee: true }));
    const row = await bookingRow(early.bookingId);
    expect(row).toMatchObject({ status: "cancelled_by_customer", paymentStatus: "refunded", amountRefundedCents: 6000 });
    expect(await occupancyCount(early.bookingId)).toBe(0);
    expect((await getBookingByToken("redbud", early.publicToken))!.statusLabel).toBe("Cancelled");

    const lateView = await getBookingByToken("redbud", late.publicToken);
    expect(lateView!.cancelMode).toBe("call");
    expect(lateView!.freeCancelUntilLabel).toBeNull();
    expect(await cancelByToken("redbud", late.publicToken)).toEqual({ ok: false, error: "past_cutoff" });
    expect((await bookingRow(late.bookingId)).status).toBe("approved");
  });

  it("17: the 2% application fee is recorded on the booking and the payment", async () => {
    const r = seeded.redbud;
    const createHold = vi.spyOn(fakePaymentProvider, "createHold");
    const req = await requestBooking(r, "S3", SAT, "09:00", 60); // $60
    expect(createHold).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 6000, applicationFeeCents: 120, idempotencyKey: `hold-${req.bookingId}` }),
    );
    const row = await bookingRow(req.bookingId);
    expect(row.applicationFeeCents).toBe(120);
    expect(row.applicationFeeCents).toBe(applicationFeeCents(row.priceCents, 200));
  });
});

describe("staff rules", () => {
  it("staff can only refund in full; the owner can refund part", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "C2", SAT, "18:00", 120); // $120
    await approveBooking(staffCtx(r), req.bookingId);
    expect(await cancelBooking(staffCtx(r), { bookingId: req.bookingId, refund: "partial", amountCents: 1000 })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    const res = await cancelBooking(ownerCtx(r), { bookingId: req.bookingId, refund: "partial", amountCents: 4500, message: "Rain" });
    expect(res).toMatchObject({ ok: true, status: "cancelled_by_facility" });
    const row = await bookingRow(req.bookingId);
    expect(row).toMatchObject({ paymentStatus: "partially_refunded", amountRefundedCents: 4500, cancelReason: "Rain" });
    expect(notified("cancelled_by_facility")).toHaveLength(1);
  });

  it("details are validated with field errors", async () => {
    const r = seeded.redbud;
    const start = await startCheckout("redbud", {
      resourceId: r.resources.S1A,
      startsAt: local(SAT, "09:00").toISOString(),
      durationMinutes: 60,
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const res = await saveCheckoutDetails("redbud", start.hold.checkoutToken, {
      name: " ",
      email: "nope",
      phone: "555",
      waiverAccepted: false,
    });
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    if (res.ok || res.error !== "invalid") return;
    expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(["email", "name", "phone", "waiverAccepted"]);
    expect(res.fieldErrors?.phone).toBe("Enter a 10-digit phone number.");
    const row = await h.db.select().from(bookings).where(and(eq(bookings.id, start.hold.bookingId)));
    expect(row[0].customerId).toBeNull();
  });
});
