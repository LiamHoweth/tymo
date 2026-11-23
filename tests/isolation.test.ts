import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/email/notify", () => ({ notify: vi.fn(async () => {}) }));

import { eq, sql } from "drizzle-orm";
import { withSystem, withTenant } from "@/server/db";
import { auditLog, bookings, customers, tenants } from "@/server/db/schema";
import { cancelByToken, getBookingByToken } from "@/server/booking/public";
import {
  approveBooking,
  cancelBooking,
  getApprovalQueue,
  getBookingDetail,
  getCalendarDay,
  saveStaffNotes,
} from "@/server/booking/staff";
import { ownerCtx, staffCtx } from "./helpers/booking";
import { resetAndSeed, setupTestDb, teardownTestDb, type DbHandle, type SeedResult } from "./helpers/db";

let h: DbHandle;
let seeded: SeedResult;

beforeAll(async () => {
  h = await setupTestDb();
  seeded = await resetAndSeed(h, { sampleBookings: true });
});
afterAll(async () => {
  await teardownTestDb(h);
});

describe("18: facility A cannot see facility B", () => {
  it("RLS hides B's rows inside withTenant(A), even with raw SQL and no tenant filter", async () => {
    const a = seeded.redbud.tenantId;
    const b = seeded.cedar.tenantId;
    const total = await withSystem(async (tx) => (await tx.select().from(bookings)).length);
    expect(total).toBe(8); // 7 Redbud + 1 Cedar

    await withTenant(a, async (tx) => {
      expect(await tx.select().from(bookings).where(eq(bookings.tenantId, b))).toEqual([]);
      expect(await tx.select().from(customers).where(eq(customers.tenantId, b))).toEqual([]);
      const raw = await tx.execute(sql`select tenant_id from bookings`);
      const rows = (raw as unknown as { rows: { tenant_id: string }[] }).rows;
      expect(rows).toHaveLength(7);
      expect(rows.every((r) => r.tenant_id === a)).toBe(true);
      const rawCustomers = await tx.execute(sql`select email from customers`);
      expect((rawCustomers as unknown as { rows: { email: string }[] }).rows.map((r) => r.email)).not.toContain("lee.walker@example.com");
      const occ = await tx.execute(sql`select count(*)::int as n from unit_occupancy where tenant_id = ${b}`);
      expect((occ as unknown as { rows: { n: number }[] }).rows[0].n).toBe(0);
    });

    // Writing into B from A's transaction is refused.
    await expect(
      withTenant(a, (tx) =>
        tx.insert(customers).values({ tenantId: b, name: "Intruder", email: "x@example.com", phone: "(405) 555-0100" }),
      ),
    ).rejects.toThrow();
    // Updating B's rows from A touches nothing.
    const updated = await withTenant(a, (tx) =>
      tx.update(bookings).set({ staffNotes: "hacked" }).where(eq(bookings.tenantId, b)).returning({ id: bookings.id }),
    );
    expect(updated).toEqual([]);
    // The audit log is append-only for the app role.
    await expect(withTenant(a, (tx) => tx.update(auditLog).set({ reason: "edited" }))).rejects.toThrow();
    await expect(withTenant(a, (tx) => tx.delete(auditLog))).rejects.toThrow();
  });

  it("A's staff get not-found for B's booking ids and tokens", async () => {
    const ctxA = ownerCtx(seeded.redbud);
    const bBooking = seeded.cedar.bookings.a1;
    expect(await getBookingDetail(ctxA, bBooking.id)).toBeNull();
    expect(await approveBooking(ctxA, bBooking.id)).toMatchObject({ ok: false, error: "not_found" });
    expect(await cancelBooking(ctxA, { bookingId: bBooking.id, refund: "full" })).toMatchObject({ ok: false, error: "not_found" });
    await saveStaffNotes(ctxA, bBooking.id, "should not land");
    const [row] = await withSystem((tx) => tx.select().from(bookings).where(eq(bookings.id, bBooking.id)));
    expect(row.staffNotes).toBeNull();
    expect(await getBookingByToken("redbud", bBooking.publicToken!)).toBeNull();
    expect(await cancelByToken("redbud", bBooking.publicToken!)).toEqual({ ok: false, error: "not_found" });
    // A's calendar never shows B's courts.
    const day = await getCalendarDay(ctxA, "2026-12-07");
    expect(day.rows.map((r) => r.code)).not.toContain("Ct1");
    // B's own link still works.
    expect((await getBookingByToken("cedar", bBooking.publicToken!))?.statusLabel).toBe("Booked");
  });

  it("seeded sample bookings can be approved and refunded with the fake provider", async () => {
    const r = seeded.redbud;
    const queue = await getApprovalQueue(ownerCtx(r));
    expect(queue).toHaveLength(3);
    expect(queue[0].urgent).toBe(true); // deadline about 1.5 h away
    const approved = await approveBooking(staffCtx(r), r.bookings.r2.id);
    expect(approved).toMatchObject({ ok: true, status: "approved" });
    const [row] = await withSystem((tx) => tx.select().from(bookings).where(eq(bookings.id, r.bookings.r2.id)));
    expect(row.amountCapturedCents).toBe(row.priceCents);
    const cancelled = await cancelBooking(ownerCtx(r), { bookingId: r.bookings.a2.id, refund: "full" });
    expect(cancelled).toMatchObject({ ok: true, status: "cancelled_by_facility" });
  });

  it("missing tenant context returns no rows for the app role", async () => {
    const db = h.db;
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role tymo_app`);
      const r = await tx.execute(sql`select count(*)::int as n from bookings`);
      return (r as unknown as { rows: { n: number }[] }).rows[0].n;
    });
    expect(n).toBe(0);
    // tenants has no RLS (looked up by slug before a tenant is known).
    const slugs = await withSystem(async (tx) => (await tx.select({ slug: tenants.slug }).from(tenants)).map((t) => t.slug).sort());
    expect(slugs).toEqual(["cedar", "redbud"]);
  });
});
