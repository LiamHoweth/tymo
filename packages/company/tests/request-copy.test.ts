import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts reads the environment once at import, so set the copy inboxes before
// anything imports it. The staff address is listed too: it must not get two emails.
vi.hoisted(() => {
  process.env.TYMO_REQUEST_COPY_TO = " copy-one@example.test, Copy-Two@example.test,staff@redbud.example,not-an-email ";
});
vi.mock("server-only", () => ({}));

import { and, asc, eq } from "drizzle-orm";
import { emailOutbox } from "@tymo/db/schema";
import { requestBooking } from "./helpers/booking";
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
  seeded = await resetAndSeed(h, { now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await teardownTestDb(h);
});

async function newRequestEmails(bookingId: string) {
  return h.db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.bookingId, bookingId), eq(emailOutbox.kind, "staff_new_request")))
    .orderBy(asc(emailOutbox.toEmail));
}

describe("request copy email (TYMO_REQUEST_COPY_TO)", () => {
  it("sends every copy inbox one clean summary of the new request, with an admin console link", async () => {
    const res = await requestBooking(seeded.redbud, "N1A", SAT, "10:00", 90);
    const rows = await newRequestEmails(res.bookingId);
    const copies = rows.filter((r) => r.subject.startsWith("New request at "));

    expect(copies.map((r) => r.toEmail)).toEqual(["copy-one@example.test", "copy-two@example.test"]);
    for (const copy of copies) {
      expect(copy.subject).toBe("New request at Redbud Soccer Complex: N1A, Sat Dec 5, 10:00 to 11:30 AM");
      expect(copy.text).toContain("Facility: Redbud Soccer Complex");
      expect(copy.text).toContain("Customer: Jordan Avery");
      expect(copy.text).toContain("Email: jordan@example.com");
      expect(copy.text).toContain("Team: Cimarron Kickers U11");
      expect(copy.text).toContain("When: Sat, Dec 5, 10:00–11:30 AM CT");
      expect(copy.text).toContain(`http://localhost:3002/admin/bookings/${res.bookingId}`);
      expect(copy.html).toContain(`http://localhost:3002/admin/bookings/${res.bookingId}`);
      expect(copy.error).toBeNull();
    }
  });

  it("still emails the facility team, and a team member listed as a copy inbox gets only the staff email", async () => {
    const res = await requestBooking(seeded.redbud, "N1A", SAT, "10:00", 90);
    const rows = await newRequestEmails(res.bookingId);
    const staff = rows.filter((r) => r.subject.startsWith("New request: "));

    expect(staff.map((r) => r.toEmail)).toEqual(["owner@redbud.example", "staff@redbud.example"]);
    expect(rows.filter((r) => r.toEmail === "staff@redbud.example")).toHaveLength(1);
    expect(rows.some((r) => r.toEmail === "not-an-email")).toBe(false);
  });
});
