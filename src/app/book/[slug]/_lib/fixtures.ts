import "server-only";
import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import type * as live from "@/server/booking/public";
import type {
  BookingPublicView,
  DateChip,
  DayAvailability,
  FacilityPublic,
  FieldCard,
  FieldGroup,
  ResourceOption,
  SlotOption,
} from "@/lib/types";
import { formatCard } from "@/lib/format";

/**
 * DEV ONLY (TYMO_UI_FIXTURES=1). In-memory stand-in for the booking engine
 * so the customer UI can be clicked through before the engine lands. The
 * facility is the fictional Redbud Soccer Complex. Behaviors to try:
 *  - Thanksgiving (Nov 26) is closed; today is inside the 24-hour lead time.
 *  - Indoor Field is booked all day five days from today.
 *  - Any 6:30 PM start is "just taken" at Continue.
 *  - Card 4000 0000 0000 0002 declines at Send.
 *  - /book/redbud/b/demo-requested | demo-booked | demo-call | demo-declined |
 *    demo-expired | demo-failed | demo-cancelled | demo-refunded
 */

const ZONE = "America/Chicago";

const facility: FacilityPublic = {
  id: "fx-redbud",
  slug: "redbud",
  name: "Redbud Soccer Complex",
  city: "Redbud, OK",
  address: "2400 Redbud Lane, Redbud, OK",
  contactPhone: "5805550142",
  contactEmail: "frontdesk@example.com",
  timeZone: ZONE,
  timeZoneLabel: "CT",
  brand: { primary: "#16324f", accent: "#c2255c", logoUrl: null },
  waiverText:
    "Rental waiver (sample)\n\nBy booking, you agree that soccer involves physical contact and a risk of injury. You accept that risk for yourself and everyone in your group.\n\nYou are responsible for your group's behavior and for any damage to fields, goals or nets during your rental.\n\nNo metal cleats on turf. No glass, pets or open flames on the grounds.\n\nThe complex may end a rental early for unsafe weather or behavior. Weather closures are refunded in full.",
  waiverVersion: 3,
  cancellationPolicyText: null,
  cancelCutoffMinutes: 2880,
  bookingWindowDays: 60,
  leadTimeMinutes: 1440,
  checkoutHoldMinutes: 10,
  bookingsEnabled: true,
  payments: { mode: "fake", stripeAccountId: null, publishableKey: null },
};

const opt = (
  id: string,
  code: string,
  name: string,
  kind: ResourceOption["kind"],
  choiceLabel: string,
  price: number,
  description: string | null = null,
): ResourceOption => ({
  id,
  code,
  name,
  kind,
  choiceLabel,
  description,
  priceCentsPerHour: price,
  slotMinutes: 30,
  minMinutes: 60,
  maxMinutes: 240,
});

const single = (id: string, code: string, name: string, group: string, surface: string, indoor: boolean, price: number, description: string | null = null): FieldCard => ({
  id,
  code,
  name,
  groupLabel: group,
  surface,
  indoor,
  description,
  fromPriceCentsPerHour: price,
  layout: "single",
  options: [opt(id, code, name, "single", name, price, description)],
});

const split = (code: string, side: string): FieldCard => ({
  id: `r-${code.toLowerCase()}`,
  code,
  name: code,
  groupLabel: "Grass fields",
  surface: "Grass",
  indoor: false,
  description: `${side} side of the complex.`,
  fromPriceCentsPerHour: 3000,
  layout: "split2",
  options: [
    opt(`r-${code.toLowerCase()}`, code, `${code} · Full field`, "full", "Full field", 6000),
    opt(`r-${code.toLowerCase()}a`, `${code}A`, `${code} · Half A`, "part", "Half A", 3000, "West half, by the parking lot"),
    opt(`r-${code.toLowerCase()}b`, `${code}B`, `${code} · Half B`, "part", "Half B", 3000, "East half, by the pavilion"),
  ],
});

const groups: FieldGroup[] = [
  {
    label: "Indoor Field",
    detail: "Turf, indoors. 1 hour minimum.",
    fromPriceCentsPerHour: 8000,
    cards: [single("r-indoor", "IN", "Indoor Field", "Indoor Field", "Turf", true, 8000, "Heated, lit, with team benches.")],
  },
  {
    label: "Turf fields",
    detail: "C1, C2, C3 and Championship.",
    fromPriceCentsPerHour: 6000,
    cards: [
      single("r-c1", "C1", "C1", "Turf fields", "Turf", false, 6000),
      single("r-c2", "C2", "C2", "Turf fields", "Turf", false, 6000),
      single("r-c3", "C3", "C3", "Turf fields", "Turf", false, 6000),
      single("r-champ", "CH", "Championship", "Turf fields", "Turf", false, 9000, "Stadium lights and bleachers."),
    ],
  },
  {
    label: "Grass fields",
    detail: "North and South. Full or half.",
    fromPriceCentsPerHour: 3000,
    cards: [split("N1", "North"), split("S1", "South")],
  },
];

const allOptions = groups.flatMap((g) => g.cards.flatMap((c) => c.options));
const optionById = (id: string) => allOptions.find((o) => o.id === id);

const today = () => DateTime.now().setZone(ZONE).startOf("day");
const closures: Record<string, string> = { "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas Day" };

interface Hold {
  token: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  expiresAt: string;
  details?: { name: string; email: string; phone: string; team?: string };
  publicToken?: string;
}

const g = globalThis as Record<string, unknown>;
const holds = (g.__tymoUiHolds ??= new Map<string, Hold>()) as Map<string, Hold>;
const bookings = (g.__tymoUiBookings ??= new Map<string, BookingPublicView>()) as Map<string, BookingPublicView>;

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function day(resourceId: string, date: string, minutes: number): DayAvailability {
  const d = DateTime.fromISO(date, { zone: ZONE });
  const o = optionById(resourceId)!;
  const base = { date, dateLabel: d.toFormat("ccc, LLL d"), resourceId, durationMinutes: minutes };
  if (closures[date]) return { ...base, closed: true, closedReason: closures[date], slots: [] };
  const offset = d.diff(today(), "days").days;
  const dayReason = offset < 1 ? "too_soon" : offset > facility.bookingWindowDays ? "too_far" : undefined;
  const fullDay = resourceId === "r-indoor" && offset === 5;
  const slots: SlotOption[] = [];
  for (let start = d.set({ hour: 7 }); start.plus({ minutes }) <= d.set({ hour: 21 }); start = start.plus({ minutes: 30 })) {
    const end = start.plus({ minutes });
    const busy = fullDay || hash(`${resourceId}|${start.toISO()}`) % 5 === 0;
    slots.push({
      startsAt: start.toUTC().toISO()!,
      endsAt: end.toUTC().toISO()!,
      startLocal: start.toFormat("h:mm a"),
      endLocal: end.toFormat("h:mm a"),
      period: start.hour < 12 ? "Morning" : start.hour < 17 ? "Afternoon" : "Evening",
      available: !dayReason && !busy,
      reason: dayReason ?? (busy ? "taken" : undefined),
      priceCents: Math.round((o.priceCentsPerHour * minutes) / 60),
    });
  }
  return { ...base, closed: false, dayReason, slots };
}

function view(token: string, patch: Partial<BookingPublicView>): BookingPublicView {
  const start = today().plus({ days: 13 }).set({ hour: 17 });
  return {
    bookingId: `bk-${token}`,
    facility,
    status: "requested",
    statusLabel: "Requested",
    resourceName: "N1 · Half A",
    whenLabel: `${start.toFormat("cccc, LLLL d")}, 5:00 to 6:30 PM CT`,
    startsAt: start.toUTC().toISO()!,
    endsAt: start.plus({ minutes: 90 }).toUTC().toISO()!,
    priceCents: 4500,
    amountRefundedCents: 0,
    cardLabel: "Visa ending 4242",
    customerName: "Jamie Ortiz",
    customerEmail: "jamie@example.com",
    team: "Storm U12",
    approvalDeadlineLabel: `${DateTime.now().setZone(ZONE).plus({ hours: 48 }).toFormat("ccc, LLL d 'at' h:mm a")} CT`,
    freeCancelUntilLabel: `${start.minus({ hours: 48 }).toFormat("ccc, LLL d 'at' h:mm a")} CT`,
    declineReason: null,
    cancelReason: null,
    cancelMode: "request",
    refundIfCancelledCents: 0,
    ...patch,
  };
}

const demos: Record<string, () => BookingPublicView> = {
  "demo-requested": () => view("demo-requested", {}),
  "demo-booked": () =>
    view("demo-booked", { status: "approved", statusLabel: "Booked", cancelMode: "refund", refundIfCancelledCents: 4500, approvalDeadlineLabel: null }),
  "demo-call": () =>
    view("demo-call", { status: "approved", statusLabel: "Booked", cancelMode: "call", freeCancelUntilLabel: null, approvalDeadlineLabel: null }),
  "demo-declined": () =>
    view("demo-declined", { status: "declined", statusLabel: "Not booked", cancelMode: "none", declineReason: "The field is set up for a tournament that weekend." }),
  "demo-expired": () => view("demo-expired", { status: "expired", statusLabel: "Expired", cancelMode: "none" }),
  "demo-failed": () => view("demo-failed", { status: "payment_failed", statusLabel: "Not booked", cancelMode: "none" }),
  "demo-cancelled": () => view("demo-cancelled", { status: "cancelled_by_customer", statusLabel: "Cancelled", cancelMode: "none" }),
  "demo-refunded": () =>
    view("demo-refunded", {
      status: "cancelled_by_facility",
      statusLabel: "Cancelled",
      cancelMode: "none",
      amountRefundedCents: 4500,
      cancelReason: "Fields closed after heavy rain.",
    }),
};

const tokenFor = () => randomBytes(12).toString("base64url");

export const fixtureEngine: typeof live = {
  async getFacility(slug) {
    await wait(60);
    return slug === facility.slug ? facility : null;
  },
  async getFieldGroups(slug) {
    await wait(80);
    return slug === facility.slug ? groups : [];
  },
  async getDateChips(_slug, resourceId, days = 14) {
    await wait(80);
    const chips: DateChip[] = [];
    for (let i = 0; i < days; i++) {
      const d = today().plus({ days: i });
      const date = d.toISODate()!;
      const info = day(resourceId, date, 60);
      chips.push({ date, label: d.toFormat("ccc LLL d"), closed: info.closed, bookable: !info.closed && !info.dayReason });
    }
    return chips;
  },
  async getDayAvailability(_slug, resourceId, date, minutes) {
    await wait(700);
    return day(resourceId, date, minutes);
  },
  async startCheckout(_slug, input) {
    await wait(400);
    const o = optionById(input.resourceId);
    if (!o) return { ok: false, error: "invalid" };
    const start = DateTime.fromISO(input.startsAt).setZone(ZONE);
    if (start.hour === 18 && start.minute === 30) return { ok: false, error: "slot_taken" };
    const end = start.plus({ minutes: input.durationMinutes });
    const token = tokenFor();
    const hold: Hold = {
      token,
      resourceId: o.id,
      startsAt: start.toUTC().toISO()!,
      endsAt: end.toUTC().toISO()!,
      priceCents: Math.round((o.priceCentsPerHour * input.durationMinutes) / 60),
      expiresAt: DateTime.now().plus({ minutes: facility.checkoutHoldMinutes }).toUTC().toISO()!,
    };
    holds.set(token, hold);
    return {
      ok: true,
      hold: {
        bookingId: `bk-${token}`,
        checkoutToken: token,
        expiresAt: hold.expiresAt,
        resourceId: o.id,
        resourceName: o.name,
        startsAt: hold.startsAt,
        endsAt: hold.endsAt,
        whenLabel: `${start.toFormat("ccc, LLL d")} · ${start.toFormat("h:mm")}–${end.toFormat("h:mm a")} CT`,
        priceCents: hold.priceCents,
      },
    };
  },
  async saveCheckoutDetails(_slug, token, details) {
    await wait(300);
    const hold = holds.get(token);
    if (!hold || DateTime.fromISO(hold.expiresAt) < DateTime.now()) return { ok: false, error: "hold_expired" };
    if (!details.waiverAccepted) return { ok: false, error: "invalid", fieldErrors: { waiverAccepted: "Check the box to agree to the waiver." } };
    hold.details = { name: details.name, email: details.email, phone: details.phone, team: details.team };
    return { ok: true };
  },
  async preparePayment(_slug, token) {
    await wait(200);
    const hold = holds.get(token);
    if (!hold || DateTime.fromISO(hold.expiresAt) < DateTime.now()) return { ok: false, error: "hold_expired" };
    if (!hold.details) return { ok: false, error: "missing_details" };
    return { ok: true, mode: "fake" };
  },
  async submitRequest(_slug, input) {
    await wait(900);
    const hold = holds.get(input.checkoutToken);
    if (!hold) return { ok: false, error: "hold_expired" };
    if (hold.publicToken) return { ok: false, error: "already_submitted", publicToken: hold.publicToken };
    if (DateTime.fromISO(hold.expiresAt) < DateTime.now()) return { ok: false, error: "hold_expired" };
    if (!hold.details) return { ok: false, error: "invalid" };
    const digits = (input.fakeCardNumber ?? "").replace(/\D/g, "");
    if (digits === "4000000000000002") return { ok: false, error: "card_declined" };
    const o = optionById(hold.resourceId)!;
    const publicToken = tokenFor();
    hold.publicToken = publicToken;
    const start = DateTime.fromISO(hold.startsAt).setZone(ZONE);
    const end = DateTime.fromISO(hold.endsAt).setZone(ZONE);
    const deadline = DateTime.now().plus({ hours: 48 });
    const insideCutoff = start.minus({ minutes: facility.cancelCutoffMinutes }) <= DateTime.now();
    bookings.set(
      publicToken,
      view(publicToken, {
        resourceName: o.name,
        whenLabel: `${start.toFormat("cccc, LLLL d")}, ${start.toFormat("h:mm")} to ${end.toFormat("h:mm a")} CT`,
        startsAt: hold.startsAt,
        endsAt: hold.endsAt,
        priceCents: hold.priceCents,
        cardLabel: formatCard(digits.startsWith("4") ? "visa" : digits.startsWith("5") ? "mastercard" : null, digits.slice(-4)),
        customerName: hold.details.name,
        customerEmail: hold.details.email,
        team: hold.details.team || null,
        approvalDeadlineLabel: `${deadline.setZone(ZONE).toFormat("ccc, LLL d 'at' h:mm a")} CT`,
        freeCancelUntilLabel: insideCutoff ? null : `${start.minus({ minutes: facility.cancelCutoffMinutes }).toFormat("ccc, LLL d 'at' h:mm a")} CT`,
      }),
    );
    return { ok: true, bookingId: `bk-${hold.token}`, publicToken, approvalDeadlineAt: deadline.toUTC().toISO()! };
  },
  async abandonCheckout(_slug, token) {
    await wait(100);
    holds.delete(token);
  },
  async getBookingByToken(slug, token) {
    await wait(150);
    if (slug !== facility.slug) return null;
    return bookings.get(token) ?? demos[token]?.() ?? null;
  },
  async cancelByToken(_slug, token) {
    await wait(600);
    const b = bookings.get(token) ?? demos[token]?.();
    if (!b) return { ok: false, error: "not_found" };
    if (b.cancelMode === "call") return { ok: false, error: "past_cutoff" };
    if (b.cancelMode === "none") return { ok: false, error: "not_cancellable" };
    const refunded = b.cancelMode === "refund" ? b.refundIfCancelledCents : 0;
    bookings.set(token, { ...b, status: "cancelled_by_customer", statusLabel: "Cancelled", cancelMode: "none", amountRefundedCents: refunded });
    return { ok: true, status: "cancelled_by_customer", refundedCents: refunded };
  },
};
