import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/email/notify", () => ({ notify: vi.fn(async () => {}) }));

import { and, eq, sql } from "drizzle-orm";
import { notify } from "@/server/email/notify";
import { blocks, bookings, operatingHours, unitOccupancy } from "@/server/db/schema";
import { getDayAvailability } from "@/server/booking/public";
import {
  approveBooking,
  cancelBooking,
  createBlock,
  getCalendarDay,
  getCalendarWeek,
  listBlocks,
  previewBlock,
  removeBlock,
} from "@/server/booking/staff";
import { runSweep } from "@/server/booking/jobs";
import { zoneAbbrev } from "@/server/booking/core/time";
import { local, ownerCtx, requestBooking, SAM, staffCtx, ZONE } from "./helpers/booking";
import { resetAndSeed, setupTestDb, teardownTestDb, type DbHandle, type SeedResult } from "./helpers/db";

let h: DbHandle;
let seeded: SeedResult;

beforeAll(async () => {
  h = await setupTestDb();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await teardownTestDb(h);
});

const slotAt = (day: { slots: { startsAt: string; available: boolean; reason?: string }[] }, at: Date) =>
  day.slots.find((s) => s.startsAt === at.toISOString());

describe("blocks in December 2026", () => {
  // Tue Dec 1 2026, 9:00 AM Central. The seed's Guthrie High School hold on N1 runs Mondays 3:00-5:30 PM from Dec 7.
  const NOW = new Date("2026-12-01T15:00:00Z");
  beforeEach(async () => {
    vi.setSystemTime(NOW);
    vi.mocked(notify).mockClear();
    seeded = await resetAndSeed(h, { now: NOW });
  });

  it("13: a weekly school hold reads Not available, unlabeled; a skipped date is bookable", async () => {
    const r = seeded.redbud;
    const blockId = r.blocks["Guthrie High School"];
    const removed = await removeBlock(staffCtx(r), blockId, "this", "2026-12-14");
    expect(removed.ok).toBe(true);
    expect(removed.message).toBe("Removed Guthrie High School on Mon, Dec 14. N1 opens for booking 3:00–5:30 PM.");

    const dec7 = await getDayAvailability("redbud", r.resources.N1, "2026-12-07", 60);
    expect(slotAt(dec7, local("2026-12-07", "15:00"))).toMatchObject({ available: false, reason: "taken" });
    expect(slotAt(dec7, local("2026-12-07", "14:30"))!.available).toBe(false); // runs into 3:00
    expect(slotAt(dec7, local("2026-12-07", "14:00"))!.available).toBe(true);
    expect(slotAt(dec7, local("2026-12-07", "17:30"))!.available).toBe(true);
    expect(JSON.stringify(dec7)).not.toMatch(/Guthrie/);
    const half = await getDayAvailability("redbud", r.resources.N1B, "2026-12-07", 60);
    expect(slotAt(half, local("2026-12-07", "16:00"))!.available).toBe(false);

    const dec14 = await getDayAvailability("redbud", r.resources.N1, "2026-12-14", 60);
    expect(slotAt(dec14, local("2026-12-14", "15:00"))!.available).toBe(true);
    const booked = await requestBooking(r, "N1", "2026-12-14", "15:00", 120);
    expect(booked.ok).toBe(true);

    const [row] = await h.db.select().from(blocks).where(eq(blocks.id, blockId));
    expect(row.skipDates).toEqual(["2026-12-14"]);
  });

  it("13: a weekly block over a booking offers to skip that date", async () => {
    const r = seeded.redbud;
    const req = await requestBooking(r, "C2", "2026-12-09", "18:00", 60);
    const input = {
      kind: "weekly" as const,
      label: "Adult pickup league",
      resourceId: r.resources.C2,
      weekdays: [3],
      startDate: "2026-12-02",
      untilDate: "2027-01-27",
      startLocal: "18:00",
      endLocal: "19:30",
    };
    const preview = await previewBlock(staffCtx(r), input);
    expect(preview.summary).toBe("Every Wednesday, Dec 2 to Jan 27: 9 dates.");
    expect(preview.conflictDates).toEqual(["2026-12-09"]);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]).toMatchObject({ bookingId: req.bookingId, status: "requested", customerName: "Jordan Avery" });
    expect(preview).toMatchObject({ canSave: false, canSaveSkippingConflicts: true, overlapNote: null });

    expect(await createBlock(staffCtx(r), input)).toMatchObject({ ok: false, error: "conflicts" });
    const saved = await createBlock(staffCtx(r), input, { skipConflicts: true });
    expect(saved).toMatchObject({ ok: true, savedCount: 8, skippedDates: ["2026-12-09"] });

    // The booking is untouched; other Wednesdays are blocked; Dec 9 after the booking is open.
    const [b] = await h.db.select().from(bookings).where(eq(bookings.id, req.bookingId));
    expect(b.status).toBe("requested");
    const dec9 = await getDayAvailability("redbud", r.resources.C2, "2026-12-09", 60);
    expect(slotAt(dec9, local("2026-12-09", "19:00"))!.available).toBe(true);
    const dec16 = await getDayAvailability("redbud", r.resources.C2, "2026-12-16", 60);
    expect(slotAt(dec16, local("2026-12-16", "18:30"))!.available).toBe(false);
  });

  it("blocks show overlap notes, never cover bookings, and list for staff", async () => {
    const r = seeded.redbud;
    const full = await previewBlock(staffCtx(r), { kind: "one_time", label: "Paint lines", resourceId: r.resources.S1, date: "2026-12-12", startLocal: "13:00", endLocal: "16:00" });
    expect(full.overlapNote).toBe("Also blocks S1A and S1B");
    expect(full.summary).toBe("Sat, Dec 12, 1:00–4:00 PM CT");
    const half = await previewBlock(staffCtx(r), { kind: "one_time", label: "Paint lines", resourceId: r.resources.S1A, date: "2026-12-12", startLocal: "13:00", endLocal: "16:00" });
    expect(half.overlapNote).toBe("S1 full field also becomes unavailable.");

    const list = await listBlocks(staffCtx(r));
    expect(list.map((b) => b.label)).toEqual(["Guthrie High School", "Adult pickup league"]);
    expect(list[0]).toMatchObject({ resourceLabel: "N1", kind: "weekly", summary: "Every Monday, 3:00–5:30 PM, Dec 7 to May 24" });
  });

  it("14: a venue closure over a Requested and an Approved booking is refused until staff resolve them", async () => {
    const r = seeded.redbud;
    const approved = await requestBooking(r, "Indoor", "2026-12-10", "10:00", 60);
    await approveBooking(staffCtx(r), approved.bookingId);
    const requested = await requestBooking(r, "S3B", "2026-12-10", "15:00", 60, SAM);
    const closure = {
      kind: "closure" as const,
      label: "Ice storm",
      publicReason: "Weather",
      resourceId: null,
      date: "2026-12-10",
      allDay: true,
    };
    const preview = await previewBlock(ownerCtx(r), closure);
    expect(preview.summary).toBe("Closed Thu, Dec 10, all day");
    expect(preview.canSave).toBe(false);
    expect(preview.conflicts.map((c) => c.bookingId).sort()).toEqual([approved.bookingId, requested.bookingId].sort());
    expect(await createBlock(ownerCtx(r), closure)).toMatchObject({ ok: false, error: "conflicts" });

    // Staff resolve each listed booking (refund / release, with email), then save.
    expect(await cancelBooking(staffCtx(r), { bookingId: approved.bookingId, refund: "full", message: "Ice storm" })).toMatchObject({
      ok: true,
      status: "cancelled_by_facility",
    });
    expect(await cancelBooking(staffCtx(r), { bookingId: requested.bookingId, refund: "full", message: "Ice storm" })).toMatchObject({
      ok: true,
      status: "declined",
    });
    const saved = await createBlock(ownerCtx(r), closure);
    expect(saved.ok).toBe(true);
    const calls = vi.mocked(notify).mock.calls.map(([, e]) => e.kind);
    expect(calls).toContain("cancelled_by_facility");
    expect(calls).toContain("declined");

    const day = await getDayAvailability("redbud", r.resources.C1, "2026-12-10", 60);
    expect(day).toMatchObject({ closed: true, closedReason: "Weather", slots: [] });
    const cal = await getCalendarDay(staffCtx(r), "2026-12-10");
    expect(cal.rows).toHaveLength(11);
    expect(cal.rows.every((row) => row.items.some((i) => i.kind === "closure" && i.label === "Ice storm"))).toBe(true);
  });

  it("closures overlapping other blocks save, and removing one keeps the other in force", async () => {
    const r = seeded.redbud;
    // Indoor Field already has the Monday pickup league 7:30-9:00 PM.
    const res = await createBlock(ownerCtx(r), {
      kind: "closure",
      label: "Turf replacement",
      publicReason: "Maintenance",
      resourceId: r.resources.Indoor,
      date: "2026-12-07",
      allDay: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await getDayAvailability("redbud", r.resources.Indoor, "2026-12-07", 60)).closed).toBe(true);
    expect((await removeBlock(ownerCtx(r), res.blockId, "all")).ok).toBe(true);
    const day = await getDayAvailability("redbud", r.resources.Indoor, "2026-12-07", 60);
    expect(day.closed).toBe(false);
    expect(slotAt(day, local("2026-12-07", "19:30"))!.available).toBe(false);
    expect(slotAt(day, local("2026-12-07", "18:00"))!.available).toBe(true);
    // The league's occupancy rows are back for that evening (the database still guards it).
    const rows = await h.db
      .select({ n: sql<number>`count(*)::int` })
      .from(unitOccupancy)
      .where(and(eq(unitOccupancy.blockId, r.blocks["Adult pickup league"]), eq(unitOccupancy.occurrenceDate, "2026-12-07")));
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });

  it("calendar day: full-field items fill both lanes, halves fill one, labels are staff-only", async () => {
    const r = seeded.redbud;
    await requestBooking(r, "N2A", "2026-12-07", "10:00", 60);
    const full = await requestBooking(r, "N3", "2026-12-07", "12:00", 60, SAM);
    await approveBooking(staffCtx(r), full.bookingId);
    const day = await getCalendarDay(staffCtx(r), "2026-12-07");
    expect(day.rows.map((x) => x.code)).toEqual(["Indoor", "N1", "N2", "N3", "S1", "S2", "S3", "C1", "C2", "C3", "Champ"]);
    expect(day.timeZoneLabel).toBe("CT");
    expect(day.dayStartLocal).toBe("09:00");
    const n1 = day.rows.find((x) => x.code === "N1")!;
    expect(n1.lanes.map((l) => l.label)).toEqual(["Half A", "Half B"]);
    expect(n1.items[0]).toMatchObject({ kind: "block", label: "Guthrie High School", unitCodes: ["N1-a", "N1-b"], startLocal: "3:00 PM", occurrenceDate: "2026-12-07" });
    const n2 = day.rows.find((x) => x.code === "N2")!;
    expect(n2.items[0]).toMatchObject({ kind: "request", unitCodes: ["N2-a"], label: "Cimarron Kickers U11" });
    const n3 = day.rows.find((x) => x.code === "N3")!;
    expect(n3.items[0]).toMatchObject({ kind: "booking", unitCodes: ["N3-a", "N3-b"], label: "Sam Patel" });

    const week = await getCalendarWeek(staffCtx(r), "2026-12-07", r.resources.N1A);
    expect(week).toHaveLength(7);
    expect(week[0].rows.map((x) => x.code)).toEqual(["N1"]);
  });

  it("the sweep materializes weekly occurrences as the window moves", async () => {
    const r = seeded.redbud;
    const count = async () =>
      Number(
        (
          await h.db
            .select({ n: sql<number>`count(*)::int` })
            .from(unitOccupancy)
            .where(eq(unitOccupancy.blockId, r.blocks["Guthrie High School"]))
        )[0].n,
      );
    const before = await count();
    expect(before).toBeGreaterThan(0);
    const first = await runSweep(NOW);
    expect(first.blockOccurrencesMaterialized).toBe(0);
    const later = await runSweep(new Date(NOW.getTime() + 21 * 24 * 3600_000));
    expect(later.blockOccurrencesMaterialized).toBeGreaterThanOrEqual(2); // ~3 more Mondays per block
    expect(await count()).toBeGreaterThan(before);
  });
});

describe("15: DST week, March 8-21 2027", () => {
  // Sat Feb 20 2027, 10:00 AM Central (CST). The seed's school hold starts Mon Feb 22.
  const NOW = new Date("2027-02-20T16:00:00Z");
  beforeEach(async () => {
    vi.setSystemTime(NOW);
    seeded = await resetAndSeed(h, { now: NOW });
  });

  it("keeps the Monday 3:00 PM hold at 3:00 PM local while UTC moves", async () => {
    const r = seeded.redbud;
    const mar8 = await getDayAvailability("redbud", r.resources.N1, "2027-03-08", 60);
    const mar15 = await getDayAvailability("redbud", r.resources.N1, "2027-03-15", 60);
    const s8 = mar8.slots.find((s) => s.startLocal === "3:00 PM")!;
    const s15 = mar15.slots.find((s) => s.startLocal === "3:00 PM")!;
    expect(s8).toMatchObject({ startsAt: "2027-03-08T21:00:00.000Z", available: false, reason: "taken" });
    expect(s15).toMatchObject({ startsAt: "2027-03-15T20:00:00.000Z", available: false, reason: "taken" });
    expect(mar8.slots.find((s) => s.startLocal === "2:00 PM")!.available).toBe(true);
    expect(mar15.slots.find((s) => s.startLocal === "2:00 PM")!.available).toBe(true);
    expect(mar15.slots.find((s) => s.startLocal === "5:30 PM")!.available).toBe(true);
    expect(mar8.slots.map((s) => s.startLocal)).toEqual(mar15.slots.map((s) => s.startLocal));
    expect(zoneAbbrev(ZONE, new Date(s8.startsAt))).toBe("CST");
    expect(zoneAbbrev(ZONE, new Date(s15.startsAt))).toBe("CDT");

    // Bookings around the change keep their local times too.
    const before = await requestBooking(r, "C1", "2027-03-13", "18:00", 90);
    const after = await requestBooking(r, "C1", "2027-03-14", "18:00", 90);
    expect(before.hold.whenLabel).toBe("Sat, Mar 13 · 6:00–7:30 PM CT");
    expect(after.hold.whenLabel).toBe("Sun, Mar 14 · 6:00–7:30 PM CT");
    expect(after.hold.startsAt).toBe("2027-03-14T23:00:00.000Z");
    expect(before.hold.priceCents).toBe(after.hold.priceCents);

    // Materialized occupancy rows follow local time.
    const rows = await h.db.execute(sql`
      select occurrence_date, lower(during) as s from unit_occupancy
      where block_id = ${r.blocks["Guthrie High School"]} and occurrence_date in ('2027-03-08', '2027-03-15')
      order by occurrence_date`);
    const times = (rows as unknown as { rows: { occurrence_date: string; s: string }[] }).rows.map((x) => new Date(x.s.replace(" ", "T").replace(/\+00$/, "Z")).toISOString());
    expect(times).toContain("2027-03-08T21:00:00.000Z");
    expect(times).toContain("2027-03-15T20:00:00.000Z");

    const week1 = await getCalendarWeek(staffCtx(r), "2027-03-08", r.resources.N1);
    const week2 = await getCalendarWeek(staffCtx(r), "2027-03-15", r.resources.N1);
    const item1 = week1[0].rows[0].items.find((i) => i.kind === "block")!;
    const item2 = week2[0].rows[0].items.find((i) => i.kind === "block")!;
    expect([item1.startLocal, item2.startLocal]).toEqual(["3:00 PM", "3:00 PM"]);
    expect([item1.startsAt, item2.startsAt]).toEqual(["2027-03-08T21:00:00.000Z", "2027-03-15T20:00:00.000Z"]);
  });

  it("skips the missing hour and lists the repeated hour once", async () => {
    const r = seeded.redbud;
    // Give C3 round-the-clock Sunday hours to exercise 2 AM.
    await h.db.insert(operatingHours).values({ tenantId: r.tenantId, resourceId: r.resources.C3, weekday: 7, opensAt: "00:00", closesAt: "24:00" });
    const spring = await getDayAvailability("redbud", r.resources.C3, "2027-03-14", 60);
    const labels = spring.slots.map((s) => s.startLocal);
    expect(labels).not.toContain("2:00 AM");
    expect(labels).not.toContain("2:30 AM");
    expect(labels).toHaveLength(45);
    const late = spring.slots.find((s) => s.startLocal === "1:30 AM")!;
    expect(late.endLocal).toBe("3:30 AM");
    expect(late.priceCents).toBe(6000); // 60 elapsed minutes

    const fall = await getDayAvailability("redbud", r.resources.C3, "2027-11-07", 60);
    const fallLabels = fall.slots.map((s) => s.startLocal);
    expect(fallLabels).toHaveLength(47);
    expect(new Set(fallLabels).size).toBe(47);
    expect(fall.dayReason).toBe("too_far");
  });
});
