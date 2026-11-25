import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@tymo/platform/email/notify", () => ({ notify: vi.fn(async () => {}) }));

import { eq, sql } from "drizzle-orm";
import { auditLog, bookings, users } from "@tymo/db/schema";
import {
  getAdminBooking,
  getAdminOverview,
  listAdminFacilities,
  listAdminFacilityOptions,
  listAdminRequests,
  parseAdminStatus,
  type AdminStatusFilter,
} from "@tymo/company/admin";
import { cancelBooking } from "@tymo/company/staff";
import { ownerCtx } from "./helpers/booking";
import { resetAndSeed, setupTestDb, teardownTestDb, type DbHandle, type SeedResult } from "./helpers/db";

// Tue Dec 1 2026, 9:00 AM Central. Seeded sample bookings are relative to this.
const NOW = new Date("2026-12-01T15:00:00Z");

let h: DbHandle;
let seeded: SeedResult;

beforeAll(async () => {
  h = await setupTestDb();
  vi.setSystemTime(NOW);
  seeded = await resetAndSeed(h, { now: NOW, sampleBookings: true });

  // Cover every filter: one booking refunded by the facility, plus raw rows in
  // the statuses the sample data lacks (and two that must never show).
  const cancelled = await cancelBooking(ownerCtx(seeded.redbud), { bookingId: seeded.redbud.bookings.a3.id, refund: "full" });
  expect(cancelled).toMatchObject({ ok: true, status: "cancelled_by_facility" });
  const startsAt = new Date("2026-12-10T18:00:00Z");
  const endsAt = new Date("2026-12-10T19:00:00Z");
  const base = { startsAt, endsAt, priceCents: 4000, createdAt: new Date("2026-11-30T12:00:00Z") };
  await h.db.insert(bookings).values([
    { ...base, tenantId: seeded.cedar.tenantId, resourceId: seeded.cedar.resources.Ct2, status: "expired", paymentStatus: "canceled" },
    { ...base, tenantId: seeded.cedar.tenantId, resourceId: seeded.cedar.resources.Ct2, status: "payment_failed", paymentStatus: "failed" },
    { ...base, tenantId: seeded.redbud.tenantId, resourceId: seeded.redbud.resources.C2, status: "cancelled_by_customer", paymentStatus: "canceled" },
    { ...base, tenantId: seeded.redbud.tenantId, resourceId: seeded.redbud.resources.C3, status: "completed", paymentStatus: "captured" },
    { ...base, tenantId: seeded.redbud.tenantId, resourceId: seeded.redbud.resources.C3, status: "checking_out", paymentStatus: "pending" },
    { ...base, tenantId: seeded.redbud.tenantId, resourceId: seeded.redbud.resources.C3, status: "abandoned", paymentStatus: "none" },
  ]);
});
afterEach(() => {
  vi.setSystemTime(NOW);
});
afterAll(async () => {
  vi.useRealTimers();
  await teardownTestDb(h);
});

const EXPECTED_STATUSES: Record<AdminStatusFilter, string[]> = {
  requested: ["requested"],
  booked: ["approved", "completed"],
  not_booked: ["declined", "payment_failed"],
  expired: ["expired"],
  cancelled: ["cancelled_by_customer", "cancelled_by_facility"],
  all: ["requested", "approved", "completed", "declined", "payment_failed", "expired", "cancelled_by_customer", "cancelled_by_facility"],
};

async function statusesOf(ids: string[]): Promise<Map<string, string>> {
  const rows = await h.db.select({ id: bookings.id, status: bookings.status }).from(bookings);
  const all = new Map(rows.map((r) => [r.id, r.status as string]));
  return new Map(ids.map((id) => [id, all.get(id) ?? "missing"]));
}

async function dbFingerprint() {
  const [b] = await h.db
    .select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(version), 0)::int`, u: sql<string>`max(updated_at)::text` })
    .from(bookings);
  const [a] = await h.db.select({ n: sql<number>`count(*)::int` }).from(auditLog);
  return { bookings: b, audit: a };
}

describe("parseAdminStatus", () => {
  it("accepts the known filters and falls back to requested", () => {
    expect(parseAdminStatus("booked")).toBe("booked");
    expect(parseAdminStatus("all")).toBe("all");
    expect(parseAdminStatus(["cancelled", "booked"])).toBe("cancelled");
    expect(parseAdminStatus("checking_out")).toBe("requested");
    expect(parseAdminStatus("toString")).toBe("requested");
    expect(parseAdminStatus("")).toBe("requested");
    expect(parseAdminStatus([])).toBe("requested");
    expect(parseAdminStatus(undefined)).toBe("requested");
    expect(parseAdminStatus(null)).toBe("requested");
  });
});

describe("listAdminRequests", () => {
  it("shows rows from every facility under all, never checkout holds or abandoned carts", async () => {
    const { rows, truncated } = await listAdminRequests({ status: "all" });
    expect(truncated).toBe(false);
    expect(new Set(rows.map((r) => r.facilitySlug))).toEqual(new Set(["redbud", "cedar"]));
    // 7 Redbud samples + 1 Cedar sample + 4 extra rows that show.
    expect(rows).toHaveLength(12);
    const statuses = await statusesOf(rows.map((r) => r.bookingId));
    expect([...statuses.values()]).not.toContain("checking_out");
    expect([...statuses.values()]).not.toContain("abandoned");
    // Newest first.
    const createdRows = await h.db.select({ id: bookings.id, createdAt: bookings.createdAt }).from(bookings);
    const createdAt = new Map(createdRows.map((r) => [r.id, r.createdAt.getTime()]));
    const times = rows.map((r) => createdAt.get(r.bookingId)!);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it.each(Object.keys(EXPECTED_STATUSES) as AdminStatusFilter[])("%s returns only matching statuses", async (status) => {
    const { rows } = await listAdminRequests({ status });
    expect(rows.length).toBeGreaterThan(0);
    const statuses = await statusesOf(rows.map((r) => r.bookingId));
    for (const s of statuses.values()) expect(EXPECTED_STATUSES[status]).toContain(s);
  });

  it("requested rows sort by deadline, soonest first, with labels in the facility zone", async () => {
    const { rows } = await listAdminRequests({ status: "requested" });
    const r = seeded.redbud.bookings;
    expect(rows.map((x) => x.bookingId)).toEqual([r.r1.id, r.r2.id, r.r3.id]);
    const [first, second] = rows;
    expect(first).toMatchObject({
      facilitySlug: "redbud",
      resourceCode: "N1A",
      resourceName: "N1 · Half A",
      whenLabel: "Thu Dec 3 · 10:00 to 11:30 AM (1.5 hr) CT",
      startsAt: "2026-12-03T16:00:00.000Z",
      priceCents: 4500,
      statusLabel: "Requested",
      tone: "waiting",
      requestedLabel: "Sun, Nov 29 at 10:27 AM CT",
      deadlineLabel: "1 hr 30 min left",
      urgent: true,
    });
    expect(first.customerEmail).toMatch(/@example\.com$/);
    expect(first.team).not.toBeNull();
    expect(second).toMatchObject({ deadlineLabel: "18 hr left", urgent: false });
  });

  it("marks requests past their deadline", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 3600_000));
    const { rows } = await listAdminRequests({ status: "requested" });
    expect(rows[0]).toMatchObject({ deadlineLabel: "Past deadline", urgent: true });
    expect(rows[1].urgent).toBe(false);
  });

  it("uses the staff status words and tones", async () => {
    const { rows } = await listAdminRequests({ status: "all" });
    const byId = new Map(rows.map((r) => [r.bookingId, r]));
    const r = seeded.redbud.bookings;
    expect(byId.get(r.a1.id)).toMatchObject({ statusLabel: "Approved", tone: "good" });
    expect(byId.get(r.d1.id)).toMatchObject({ statusLabel: "Declined", tone: "bad", deadlineLabel: null, urgent: false });
    expect(byId.get(r.a3.id)).toMatchObject({ statusLabel: "Refunded", tone: "neutral" });
    const expired = rows.find((x) => x.statusLabel === "Expired");
    expect(expired?.tone).toBe("neutral");
    expect(rows.find((x) => x.statusLabel === "Payment failed")?.tone).toBe("bad");
  });

  it("filters by facility", async () => {
    const cedar = await listAdminRequests({ status: "all", facilitySlug: "cedar" });
    expect(cedar.rows.length).toBe(3);
    expect(cedar.rows.every((r) => r.facilitySlug === "cedar")).toBe(true);
    const redbud = await listAdminRequests({ status: "all", facilitySlug: "redbud" });
    expect(redbud.rows.length).toBe(9);
    expect(redbud.rows.every((r) => r.facilitySlug === "redbud")).toBe(true);
    expect((await listAdminRequests({ status: "requested", facilitySlug: "cedar" })).rows).toEqual([]);
    expect((await listAdminRequests({ status: "all", facilitySlug: "nope" })).rows).toEqual([]);
    expect((await listAdminRequests({ status: "all", facilitySlug: null })).rows).toHaveLength(12);
  });
});

describe("getAdminBooking", () => {
  it("returns a decided booking with its timeline, oldest first", async () => {
    const id = seeded.redbud.bookings.d1.id;
    const [staffUser] = await h.db.select({ name: users.name }).from(users).where(eq(users.id, seeded.redbud.staffId!));
    const d = await getAdminBooking(id);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      bookingId: id,
      facilitySlug: "redbud",
      facilityTimeZone: "America/Chicago",
      statusLabel: "Declined",
      tone: "bad",
      paymentStatusLabel: "Hold released",
      cardLabel: "Visa ending 4242",
      waiverAccepted: true,
      source: "online",
      amountCapturedCents: 0,
      amountRefundedCents: 0,
      declineReason: "N3 is being reseeded that week.",
      staffAppUrl: expect.stringMatching(new RegExp(`/staff/bookings/${id}$`)),
    });
    expect(d!.customerPhone).not.toBe("");
    expect(d!.decidedLabel).toBe(`Declined by ${staffUser.name} · Tue, Dec 1 at 1:00 AM CT`);
    expect(d!.timeline.map((e) => e.label)).toEqual(["Requested", "Declined"]);
    expect(d!.timeline.map((e) => e.actor)).toEqual(["Customer", `${staffUser.name} (staff)`]);
    expect(d!.timeline[1].reason).toBe("N3 is being reseeded that week.");
    expect(d!.timeline[0].at < d!.timeline[1].at).toBe(true);
    expect(d!.timeline[0].atLabel).toMatch(/ CT$/);
  });

  it("names the owner for an owner's decision and shows the cancellation", async () => {
    const [owner] = await h.db.select({ name: users.name }).from(users).where(eq(users.id, seeded.redbud.ownerId));
    const a1 = await getAdminBooking(seeded.redbud.bookings.a1.id);
    expect(a1?.paymentStatusLabel).toBe("Charged");
    expect(a1?.decidedLabel).toMatch(new RegExp(`^Approved by ${owner.name} · `));
    expect(a1?.timeline.map((e) => e.actor)).toEqual(["Customer", `${owner.name} (owner)`]);

    const a3 = await getAdminBooking(seeded.redbud.bookings.a3.id);
    expect(a3?.statusLabel).toBe("Refunded");
    expect(a3?.paymentStatusLabel).toBe("Refunded");
    expect(a3?.amountRefundedCents).toBe(a3?.amountCapturedCents);
    expect(a3?.decidedLabel).toMatch(/^Approved by /);
    expect(a3?.timeline.map((e) => e.label)).toEqual(["Requested", "Approved", "Cancelled by facility"]);
    expect(a3?.timeline[2].actor).toBe(`${owner.name} (owner)`);
  });

  it("shows the deadline for a request and leaves undecided bookings undecided", async () => {
    const r1 = await getAdminBooking(seeded.redbud.bookings.r1.id);
    expect(r1).toMatchObject({ paymentStatusLabel: "Card held", decidedLabel: null, deadlineLabel: "1 hr 30 min left", urgent: true });
    expect(r1?.approvalDeadlineLabel).toBe("Tue, Dec 1 at 10:30 AM CT");
  });

  it("returns null for a malformed or unknown id", async () => {
    expect(await getAdminBooking("not-a-uuid")).toBeNull();
    expect(await getAdminBooking("")).toBeNull();
    expect(await getAdminBooking("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("getAdminOverview", () => {
  it("counts across facilities, consistent with the requested list", async () => {
    const overview = await getAdminOverview();
    const requested = (await listAdminRequests({ status: "requested" })).rows;
    expect(overview.waiting).toBe(requested.filter((r) => r.deadlineLabel !== "Past deadline").length);
    expect(overview.waiting).toBe(3);
    expect(overview.dueWithin24h).toBe(2); // about 1.5 h and 18 h left
    // a1, a2 (Redbud) and the Cedar booking; a3 was cancelled.
    expect(overview.bookedUpcoming).toBe(3);
    expect(overview).toMatchObject({ facilities: 2, facilitiesTakingBookings: 2 });
  });

  it("stops counting requests once their deadline passes", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 3600_000));
    const overview = await getAdminOverview();
    expect(overview.waiting).toBe(2);
    expect(overview.dueWithin24h).toBe(1);
  });
});

describe("facilities", () => {
  it("lists both tenants by name with their counts", async () => {
    const list = await listAdminFacilities();
    expect(list.map((f) => f.slug)).toEqual(["cedar", "redbud"]);
    const [cedar, redbud] = list;
    expect(redbud).toMatchObject({
      timeZoneLabel: "CT",
      bookingsEnabled: true,
      payoutsReady: true,
      waiting: 3,
      bookedUpcoming: 2,
      staffCount: 2,
      bookingPageUrl: expect.stringMatching(/\/book\/redbud$/),
    });
    expect(redbud.city).not.toBeNull();
    expect(cedar).toMatchObject({ waiting: 0, bookedUpcoming: 1, staffCount: 1, bookingPageUrl: expect.stringMatching(/\/book\/cedar$/) });
    const overview = await getAdminOverview();
    expect(list.reduce((n, f) => n + f.waiting, 0)).toBe(overview.waiting);
    expect(list.reduce((n, f) => n + f.bookedUpcoming, 0)).toBe(overview.bookedUpcoming);
  });

  it("offers every facility in the filter menu", async () => {
    const options = await listAdminFacilityOptions();
    expect(options.map((o) => o.slug)).toEqual(["cedar", "redbud"]);
    expect(options.every((o) => o.name.length > 0)).toBe(true);
  });
});

describe("read-only", () => {
  it("never writes", async () => {
    const before = await dbFingerprint();
    await getAdminOverview();
    await listAdminFacilityOptions();
    await listAdminFacilities();
    for (const status of Object.keys(EXPECTED_STATUSES) as AdminStatusFilter[]) await listAdminRequests({ status });
    await getAdminBooking(seeded.redbud.bookings.r1.id);
    await getAdminBooking(seeded.cedar.bookings.a1.id);
    expect(await dbFingerprint()).toEqual(before);
  });
});

describe("limits", () => {
  it("returns at most 200 rows and says when there were more", async () => {
    const t = seeded.cedar;
    await h.db.insert(bookings).values(
      Array.from({ length: 200 }, (_, i) => ({
        tenantId: t.tenantId,
        resourceId: t.resources.Ct1,
        status: "declined" as const,
        paymentStatus: "canceled" as const,
        startsAt: new Date("2026-12-20T18:00:00Z"),
        endsAt: new Date("2026-12-20T19:00:00Z"),
        priceCents: 4000,
        createdAt: new Date(NOW.getTime() - i * 60_000),
      })),
    );
    const notBooked = await listAdminRequests({ status: "not_booked" });
    expect(notBooked.rows).toHaveLength(200);
    expect(notBooked.truncated).toBe(true);
    const requested = await listAdminRequests({ status: "requested" });
    expect(requested.truncated).toBe(false);
  });
});
