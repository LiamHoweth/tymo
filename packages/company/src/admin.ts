import "server-only";
import { and, asc, desc, eq, gt, inArray, lte, sql, type SQL } from "drizzle-orm";
import { env } from "@tymo/shared/env";
import { formatCard } from "@tymo/shared/format";
import { withSystem } from "@tymo/db";
import { auditLog, bookingStatus, bookings, customers, resources, tenants, users } from "@tymo/db/schema";
import { isUuid } from "./core/rules";
import { atLabel, durationLeftLabel, queueWhenLabel, zoneLabel } from "./core/time";
import { HOUR } from "./core/util";
import { staffStatusLabel, type BookingRow } from "./internal";

/**
 * Tymo admin console API (tymo services /admin): read-only views across
 * every facility. Runs withSystem (no tenant RLS) and never changes a
 * booking; approving and declining stay with each facility's staff.
 */

export type AdminStatusFilter = "requested" | "booked" | "not_booked" | "expired" | "cancelled" | "all";

/** Visual tone for a status word: waiting (requested), good (booked), bad (not booked), neutral (expired, cancelled, refunded). */
export type AdminTone = "waiting" | "good" | "bad" | "neutral";

export interface AdminOverview {
  /** Requested, approval deadline still ahead. */
  waiting: number;
  /** Requested with the approval deadline within 24 hours. */
  dueWithin24h: number;
  /** Approved and starting in the future. */
  bookedUpcoming: number;
  facilities: number;
  facilitiesTakingBookings: number;
}

export interface AdminFacilityOption {
  slug: string;
  name: string;
}

export interface AdminRequestRow {
  bookingId: string;
  facilityName: string;
  facilitySlug: string;
  /** "N1A" */
  resourceCode: string;
  /** "N1 · Half A" */
  resourceName: string;
  /** "Sat Dec 5 · 10:00 to 11:30 AM (1.5 hr) CT", in the facility's zone. */
  whenLabel: string;
  /** ISO instant. */
  startsAt: string;
  customerName: string;
  customerEmail: string;
  team: string | null;
  priceCents: number;
  /** Staff status words: "Requested", "Approved", "Declined", "Refunded", ... */
  statusLabel: string;
  tone: AdminTone;
  /** "Tue, Nov 24 at 8:05 PM CT" */
  requestedLabel: string;
  /** Requested only: "1 day 4 hr left" or "Past deadline"; null otherwise. */
  deadlineLabel: string | null;
  /** Requested with under 2 hours left, or past the deadline. */
  urgent: boolean;
}

export interface AdminTimelineEntry {
  /** ISO instant. */
  at: string;
  /** "Tue, Nov 24 at 8:05 PM CT" */
  atLabel: string;
  /** "Requested", "Approved", "Declined", "Reminder sent", ... */
  label: string;
  /** "Taylor Brooks (staff)", "Customer", "System" */
  actor: string;
  reason: string | null;
}

export interface AdminBookingDetail extends AdminRequestRow {
  facilityTimeZone: string;
  customerPhone: string;
  /** "Visa ending 4242" */
  cardLabel: string | null;
  /** "Card held", "Charged", "Hold released", "Refunded", "Partly refunded", "Failed", "No payment" */
  paymentStatusLabel: string;
  amountCapturedCents: number;
  amountRefundedCents: number;
  applicationFeeCents: number | null;
  /** atLabel of the approval deadline, when there is one. */
  approvalDeadlineLabel: string | null;
  /** "Approved by Taylor Brooks · Tue, Nov 24 at 8:00 PM CT" */
  decidedLabel: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  staffNotes: string | null;
  waiverAccepted: boolean;
  source: "online" | "staff";
  /** This booking in the facility's staff app (staff sign-in required). */
  staffAppUrl: string;
  /** Oldest first. */
  timeline: AdminTimelineEntry[];
}

export interface AdminFacilityRow {
  slug: string;
  name: string;
  city: string | null;
  /** "CT" */
  timeZoneLabel: string;
  bookingsEnabled: boolean;
  /** Stripe charges enabled on the connected account. */
  payoutsReady: boolean;
  waiting: number;
  bookedUpcoming: number;
  staffCount: number;
  /** `${companyWebUrl}/book/${slug}` */
  bookingPageUrl: string;
}

// ------------------------------------------------------------ internals

type Status = BookingRow["status"];
type PaymentStatus = BookingRow["paymentStatus"];

const LIST_LIMIT = 200;

/** Booking statuses behind each filter. Checkout holds and abandoned carts never show. */
const FILTER_STATUSES: Record<AdminStatusFilter, readonly Status[]> = {
  requested: ["requested"],
  booked: ["approved", "completed"],
  not_booked: ["declined", "payment_failed"],
  expired: ["expired"],
  cancelled: ["cancelled_by_customer", "cancelled_by_facility"],
  all: bookingStatus.enumValues.filter((s) => s !== "checking_out" && s !== "abandoned"),
};

const isFilter = (v: unknown): v is AdminStatusFilter => typeof v === "string" && Object.hasOwn(FILTER_STATUSES, v);

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  none: "No payment",
  pending: "Waiting for card",
  authorized: "Card held",
  captured: "Charged",
  canceled: "Hold released",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

/** audit_log actions written for bookings (staff.ts, public.ts, jobs.ts, internal.ts). */
const ACTION_LABELS: Record<string, string> = {
  "booking.hold": "Checkout started",
  "booking.request": "Requested",
  "booking.approve": "Approved",
  "booking.decline": "Declined",
  "booking.expire": "Expired",
  "booking.payment_failed": "Payment failed",
  "booking.cancel_customer": "Cancelled by customer",
  "booking.cancel_facility": "Cancelled by facility",
  "booking.complete": "Completed",
  "booking.reminder": "Reminder sent",
  "booking.notes": "Notes updated",
  "booking.resend_link": "Link resent",
  "booking.abandon": "Checkout timed out",
};

function toneOf(status: Status, payment: PaymentStatus): AdminTone {
  switch (status) {
    case "requested":
      return "waiting";
    case "approved":
    case "completed":
      return payment === "refunded" || payment === "partially_refunded" ? "neutral" : "good";
    case "declined":
    case "payment_failed":
      return "bad";
    default:
      return "neutral";
  }
}

/** Columns every request row needs (bookings, tenants, resources, customers). */
const rowColumns = {
  id: bookings.id,
  status: bookings.status,
  paymentStatus: bookings.paymentStatus,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  priceCents: bookings.priceCents,
  team: bookings.team,
  createdAt: bookings.createdAt,
  approvalDeadlineAt: bookings.approvalDeadlineAt,
  facilityName: tenants.name,
  facilitySlug: tenants.slug,
  timeZone: tenants.timeZone,
  resourceCode: resources.code,
  resourceName: resources.name,
  customerName: customers.name,
  customerEmail: customers.email,
};

type RowSource = {
  id: string;
  status: Status;
  paymentStatus: PaymentStatus;
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  team: string | null;
  createdAt: Date;
  approvalDeadlineAt: Date | null;
  facilityName: string;
  facilitySlug: string;
  timeZone: string;
  resourceCode: string;
  resourceName: string;
  customerName: string | null;
  customerEmail: string | null;
};

// Every join pins the booking's tenant: no RLS here, so filters are explicit.
const resourceJoin = and(eq(resources.id, bookings.resourceId), eq(resources.tenantId, bookings.tenantId));
const customerJoin = and(eq(customers.id, bookings.customerId), eq(customers.tenantId, bookings.tenantId));

function toRow(r: RowSource, now: Date): AdminRequestRow {
  const zone = r.timeZone;
  let deadlineLabel: string | null = null;
  let urgent = false;
  if (r.status === "requested") {
    const left = r.approvalDeadlineAt ? r.approvalDeadlineAt.getTime() - now.getTime() : 0;
    deadlineLabel = left > 0 ? `${durationLeftLabel(left)} left` : "Past deadline";
    urgent = left < 2 * HOUR;
  }
  return {
    bookingId: r.id,
    facilityName: r.facilityName,
    facilitySlug: r.facilitySlug,
    resourceCode: r.resourceCode,
    resourceName: r.resourceName,
    whenLabel: `${queueWhenLabel(r.startsAt, r.endsAt, zone)} ${zoneLabel(zone, r.startsAt)}`,
    startsAt: r.startsAt.toISOString(),
    customerName: r.customerName ?? "",
    customerEmail: r.customerEmail ?? "",
    team: r.team,
    priceCents: r.priceCents,
    statusLabel: staffStatusLabel({ status: r.status, paymentStatus: r.paymentStatus }),
    tone: toneOf(r.status, r.paymentStatus),
    requestedLabel: atLabel(r.createdAt, zone),
    deadlineLabel,
    urgent,
  };
}

/** count(*) FILTER (WHERE ...) as an int. */
const countWhere = (where: SQL | undefined) => sql<number>`count(*) filter (where ${where ?? sql`true`})::int`;

const waitingWhere = (now: Date) => and(eq(bookings.status, "requested"), gt(bookings.approvalDeadlineAt, now));
const bookedUpcomingWhere = (now: Date) => and(eq(bookings.status, "approved"), gt(bookings.startsAt, now));

// ------------------------------------------------------------ public API

/** Unknown or missing values fall back to "requested". */
export function parseAdminStatus(raw: string | string[] | undefined | null): AdminStatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isFilter(value) ? value : "requested";
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const now = new Date();
  const dayAhead = new Date(now.getTime() + 24 * HOUR);
  return withSystem(async (tx) => {
    const [b] = await tx
      .select({
        waiting: countWhere(waitingWhere(now)),
        dueWithin24h: countWhere(and(waitingWhere(now), lte(bookings.approvalDeadlineAt, dayAhead))),
        bookedUpcoming: countWhere(bookedUpcomingWhere(now)),
      })
      .from(bookings)
      .where(inArray(bookings.status, ["requested", "approved"]));
    const [t] = await tx
      .select({
        facilities: sql<number>`count(*)::int`,
        facilitiesTakingBookings: countWhere(eq(tenants.bookingsEnabled, true)),
      })
      .from(tenants);
    return {
      waiting: Number(b?.waiting ?? 0),
      dueWithin24h: Number(b?.dueWithin24h ?? 0),
      bookedUpcoming: Number(b?.bookedUpcoming ?? 0),
      facilities: Number(t?.facilities ?? 0),
      facilitiesTakingBookings: Number(t?.facilitiesTakingBookings ?? 0),
    };
  });
}

/** Every facility, by name, for the filter menu. */
export async function listAdminFacilityOptions(): Promise<AdminFacilityOption[]> {
  return withSystem((tx) =>
    tx.select({ slug: tenants.slug, name: tenants.name }).from(tenants).orderBy(asc(tenants.name), asc(tenants.slug)),
  );
}

/**
 * Requests across facilities. "requested" sorts by approval deadline (soonest
 * first); every other filter by newest first. At most 200 rows; truncated
 * says there were more. checking_out and abandoned carts never show.
 */
export async function listAdminRequests(filter: {
  status: AdminStatusFilter;
  facilitySlug?: string | null;
}): Promise<{ rows: AdminRequestRow[]; truncated: boolean }> {
  const now = new Date();
  const status = isFilter(filter?.status) ? filter.status : "requested";
  const slug = typeof filter?.facilitySlug === "string" ? filter.facilitySlug.trim().toLowerCase() : "";
  const where = and(inArray(bookings.status, [...FILTER_STATUSES[status]]), slug ? eq(tenants.slug, slug) : undefined);
  const order =
    status === "requested"
      ? // A missing deadline reads "Past deadline", so it sorts with the most urgent.
        [sql`${bookings.approvalDeadlineAt} asc nulls first`, asc(bookings.createdAt), asc(bookings.id)]
      : [desc(bookings.createdAt), desc(bookings.id)];
  const found = await withSystem((tx) =>
    tx
      .select(rowColumns)
      .from(bookings)
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .innerJoin(resources, resourceJoin)
      .leftJoin(customers, customerJoin)
      .where(where)
      .orderBy(...order)
      .limit(LIST_LIMIT + 1),
  );
  return {
    rows: found.slice(0, LIST_LIMIT).map((r) => toRow(r, now)),
    truncated: found.length > LIST_LIMIT,
  };
}

/** Null for a malformed id or an unknown booking. */
export async function getAdminBooking(bookingId: string): Promise<AdminBookingDetail | null> {
  if (!isUuid(bookingId)) return null;
  const now = new Date();
  return withSystem(async (tx) => {
    const [found] = await tx
      .select({
        ...rowColumns,
        tenantId: bookings.tenantId,
        customerPhone: customers.phone,
        source: bookings.source,
        cardBrand: bookings.cardBrand,
        cardLast4: bookings.cardLast4,
        amountCapturedCents: bookings.amountCapturedCents,
        amountRefundedCents: bookings.amountRefundedCents,
        applicationFeeCents: bookings.applicationFeeCents,
        declineReason: bookings.declineReason,
        cancelReason: bookings.cancelReason,
        staffNotes: bookings.staffNotes,
        waiverAcceptedAt: bookings.waiverAcceptedAt,
        decidedAt: bookings.decidedAt,
        decidedByUserId: bookings.decidedByUserId,
      })
      .from(bookings)
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .innerJoin(resources, resourceJoin)
      .leftJoin(customers, customerJoin)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!found) return null;
    const zone = found.timeZone;

    const audit = await tx
      .select({
        at: auditLog.createdAt,
        action: auditLog.action,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        reason: auditLog.reason,
      })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, found.tenantId), eq(auditLog.targetType, "booking"), eq(auditLog.targetId, found.id)))
      .orderBy(asc(auditLog.createdAt), asc(auditLog.id));

    // One lookup for every staff member named in the timeline or the decision.
    const userIds = new Set<string>();
    if (found.decidedByUserId) userIds.add(found.decidedByUserId);
    for (const a of audit) if (a.actorType === "staff" && isUuid(a.actorId)) userIds.add(a.actorId);
    const people = new Map<string, { name: string; role: "owner" | "staff" }>();
    if (userIds.size) {
      const rows = await tx
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(eq(users.tenantId, found.tenantId), inArray(users.id, [...userIds])));
      for (const u of rows) people.set(u.id, { name: u.name, role: u.role });
    }

    const timeline: AdminTimelineEntry[] = audit.map((a) => {
      let actor = "System";
      if (a.actorType === "staff") {
        const person = a.actorId ? people.get(a.actorId) : undefined;
        actor = person ? `${person.name} (${person.role})` : "Staff";
      } else if (a.actorType === "customer") {
        actor = "Customer";
      }
      return {
        at: a.at.toISOString(),
        atLabel: atLabel(a.at, zone),
        label: ACTION_LABELS[a.action] ?? a.action,
        actor,
        reason: a.reason,
      };
    });

    let decidedLabel: string | null = null;
    if (found.decidedAt) {
      const who = found.decidedByUserId ? people.get(found.decidedByUserId)?.name : undefined;
      const when = atLabel(found.decidedAt, zone);
      if (found.status === "payment_failed") decidedLabel = who ? `Payment failed · ${who} · ${when}` : `Payment failed · ${when}`;
      else {
        // Cancelled and completed bookings keep the approval that preceded them.
        const verb = found.status === "declined" ? "Declined" : "Approved";
        decidedLabel = who ? `${verb} by ${who} · ${when}` : `${verb} · ${when}`;
      }
    }

    return {
      ...toRow(found, now),
      facilityTimeZone: zone,
      customerPhone: found.customerPhone ?? "",
      cardLabel: formatCard(found.cardBrand, found.cardLast4),
      paymentStatusLabel: PAYMENT_LABELS[found.paymentStatus] ?? found.paymentStatus,
      amountCapturedCents: found.amountCapturedCents,
      amountRefundedCents: found.amountRefundedCents,
      applicationFeeCents: found.applicationFeeCents,
      approvalDeadlineLabel: found.approvalDeadlineAt ? atLabel(found.approvalDeadlineAt, zone) : null,
      decidedLabel,
      declineReason: found.declineReason,
      cancelReason: found.cancelReason,
      staffNotes: found.staffNotes,
      waiverAccepted: !!found.waiverAcceptedAt,
      source: found.source,
      staffAppUrl: `${env.companyServicesUrl}/staff/bookings/${found.id}`,
      timeline,
    };
  });
}

export async function listAdminFacilities(): Promise<AdminFacilityRow[]> {
  const now = new Date();
  return withSystem(async (tx) => {
    const list = await tx.select().from(tenants).orderBy(asc(tenants.name), asc(tenants.slug));
    const bookingCounts = await tx
      .select({
        tenantId: bookings.tenantId,
        waiting: countWhere(waitingWhere(now)),
        bookedUpcoming: countWhere(bookedUpcomingWhere(now)),
      })
      .from(bookings)
      .where(inArray(bookings.status, ["requested", "approved"]))
      .groupBy(bookings.tenantId);
    const staffCounts = await tx
      .select({ tenantId: users.tenantId, n: sql<number>`count(*)::int` })
      .from(users)
      .groupBy(users.tenantId);
    const byTenant = new Map(bookingCounts.map((c) => [c.tenantId, c]));
    const staffByTenant = new Map(staffCounts.map((c) => [c.tenantId, Number(c.n)]));
    return list.map((t) => ({
      slug: t.slug,
      name: t.name,
      city: t.city,
      timeZoneLabel: zoneLabel(t.timeZone, now),
      bookingsEnabled: t.bookingsEnabled,
      payoutsReady: t.stripeChargesEnabled,
      waiting: Number(byTenant.get(t.id)?.waiting ?? 0),
      bookedUpcoming: Number(byTenant.get(t.id)?.bookedUpcoming ?? 0),
      staffCount: staffByTenant.get(t.id) ?? 0,
      bookingPageUrl: `${env.companyWebUrl}/book/${t.slug}`,
    }));
  });
}
