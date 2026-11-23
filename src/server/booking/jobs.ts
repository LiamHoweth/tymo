import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { withSystem, withTenant } from "@/server/db";
import { blocks, bookings, tenants } from "@/server/db/schema";
import { writeAudit } from "./core/audit";
import { materializeBlock, materializeHorizon } from "./core/blocks";
import { addDays, startOfLocalDate } from "./core/time";
import { blockUnitIds, loadUnitMap } from "./core/units";
import { HOUR } from "./core/util";
import {
  abandonExpiredCheckouts,
  bump,
  cancelPaymentQuietly,
  lockBooking,
  markExpired,
  safeNotify,
  tenantById,
} from "./internal";

export interface SweepReport {
  holdsReleased: number;
  requestsExpired: number;
  remindersSent: number;
  bookingsCompleted: number;
  blockOccurrencesMaterialized: number;
}

/**
 * Periodic maintenance, run every minute by /api/cron/tick (and lazily on
 * reads where cheap). For every tenant:
 *  - delete checkout holds past hold_expires_at, mark bookings abandoned,
 *    cancel any pending payment;
 *  - expire requests past approval_deadline_at (cancel the hold, notify);
 *  - send staff reminders at 24 h and 2 h before the deadline (once each);
 *  - mark approved bookings completed after ends_at;
 *  - materialize weekly block occurrences through booking window + 30 days.
 */
export async function runSweep(now?: Date): Promise<SweepReport> {
  const at = now ?? new Date();
  const report: SweepReport = {
    holdsReleased: 0,
    requestsExpired: 0,
    remindersSent: 0,
    bookingsCompleted: 0,
    blockOccurrencesMaterialized: 0,
  };
  const tenantIds = await withSystem(async (tx) => (await tx.select({ id: tenants.id }).from(tenants)).map((t) => t.id));
  for (const tenantId of tenantIds) {
    try {
      const r = await sweepTenant(tenantId, at);
      report.holdsReleased += r.holdsReleased;
      report.requestsExpired += r.requestsExpired;
      report.remindersSent += r.remindersSent;
      report.bookingsCompleted += r.bookingsCompleted;
      report.blockOccurrencesMaterialized += r.blockOccurrencesMaterialized;
    } catch (err) {
      console.error(`[sweep] tenant ${tenantId} failed:`, err);
    }
  }
  return report;
}

/** One tenant's sweep. Payment calls and emails happen after each commit. */
export async function sweepTenant(tenantId: string, now: Date): Promise<SweepReport> {
  const report: SweepReport = {
    holdsReleased: 0,
    requestsExpired: 0,
    remindersSent: 0,
    bookingsCompleted: 0,
    blockOccurrencesMaterialized: 0,
  };

  // 1. Checkout holds past their 10 minutes.
  const { tenant, abandoned } = await withTenant(tenantId, async (tx) => {
    const t = await tenantById(tx, tenantId);
    return { tenant: t, abandoned: await abandonExpiredCheckouts(tx, tenantId, now) };
  });
  report.holdsReleased = abandoned.length;
  for (const a of abandoned) await cancelPaymentQuietly(tenant.stripeAccountId, a.paymentIntentId, a.bookingId);

  // 2. Requests past their approval deadline.
  const overdue = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.status, "requested"), lte(bookings.approvalDeadlineAt, now))),
  );
  for (const { id } of overdue) {
    const expired = await withTenant(tenantId, async (tx) => {
      const b = await lockBooking(tx, tenantId, id);
      if (!b || b.status !== "requested" || !b.approvalDeadlineAt || b.approvalDeadlineAt > now) return null;
      await markExpired(tx, b, now);
      return b;
    });
    if (!expired) continue;
    report.requestsExpired++;
    await cancelPaymentQuietly(tenant.stripeAccountId, expired.paymentIntentId, expired.id);
    await safeNotify(tenantId, { kind: "expired", bookingId: expired.id });
    await safeNotify(tenantId, { kind: "staff_request_expired", bookingId: expired.id });
  }

  // 3. Staff reminders at 24 h and 2 h left, once each. A threshold that had
  //    already passed when the request came in is skipped.
  const reminders = await withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.status, "requested"),
          sql`${bookings.approvalDeadlineAt} > ${now.toISOString()}::timestamptz`,
          sql`${bookings.approvalDeadlineAt} <= ${new Date(now.getTime() + 24 * HOUR).toISOString()}::timestamptz`,
        ),
      );
    const due: { bookingId: string; hoursLeft: 24 | 2 }[] = [];
    for (const b of rows) {
      const left = b.approvalDeadlineAt!.getTime() - now.getTime();
      const total = b.approvalDeadlineAt!.getTime() - b.createdAt.getTime();
      const sent = new Set(b.remindersSent ?? []);
      let send: 24 | 2 | null = null;
      if (left <= 2 * HOUR && !sent.has(2)) send = total > 2 * HOUR ? 2 : null;
      else if (left <= 24 * HOUR && !sent.has(24) && left > 2 * HOUR) send = total > 24 * HOUR ? 24 : null;
      const mark = new Set(sent);
      if (left <= 2 * HOUR) {
        mark.add(2);
        mark.add(24);
      } else mark.add(24);
      if (mark.size === sent.size) continue;
      await tx
        .update(bookings)
        .set({ remindersSent: [...mark].sort((a, b2) => b2 - a) })
        .where(eq(bookings.id, b.id));
      if (send) {
        await writeAudit(tx, {
          tenantId,
          actorType: "system",
          action: "booking.reminder",
          targetType: "booking",
          targetId: b.id,
          data: { hoursLeft: send },
          at: now,
        });
        due.push({ bookingId: b.id, hoursLeft: send });
      }
    }
    return due;
  });
  for (const r of reminders) {
    report.remindersSent++;
    await safeNotify(tenantId, { kind: "staff_reminder", bookingId: r.bookingId, hoursLeft: r.hoursLeft });
  }

  // 4. Approved bookings whose end time passed.
  report.bookingsCompleted = await withTenant(tenantId, async (tx) => {
    const done = await tx
      .update(bookings)
      .set({ status: "completed", completedAt: now, ...bump(now) })
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.status, "approved"), lte(bookings.endsAt, now)))
      .returning({ id: bookings.id });
    for (const b of done) {
      await writeAudit(tx, {
        tenantId,
        actorType: "system",
        action: "booking.complete",
        targetType: "booking",
        targetId: b.id,
        at: now,
      });
    }
    return done.length;
  });

  // 5. Weekly block occurrences through the booking window + 30 days.
  report.blockOccurrencesMaterialized = await withTenant(tenantId, async (tx) => {
    const zone = tenant.timeZone;
    const horizon = materializeHorizon(now, zone, tenant.bookingWindowDays);
    const to = startOfLocalDate(addDays(horizon, 1), zone).toJSDate();
    const weekly = await tx
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.tenantId, tenantId),
          eq(blocks.kind, "weekly"),
          isNull(blocks.deletedAt),
          sql`${blocks.endDate} >= ${addDays(horizon, -(tenant.bookingWindowDays + 31))}`,
        ),
      );
    if (!weekly.length) return 0;
    const map = await loadUnitMap(tx, tenantId);
    let count = 0;
    for (const block of weekly) {
      const res = await materializeBlock(tx, {
        tenantId,
        block,
        zone,
        unitIds: blockUnitIds(map, block.resourceId),
        from: now,
        to,
        mode: "skip",
      });
      count += res.inserted;
      if (res.skippedDates.length) {
        // A booking got there first (rare race): keep the booking, skip the date.
        await tx
          .update(blocks)
          .set({ skipDates: [...new Set([...(block.skipDates ?? []), ...res.skippedDates])].sort() })
          .where(eq(blocks.id, block.id));
        await writeAudit(tx, {
          tenantId,
          actorType: "system",
          action: "block.skip_conflicts",
          targetType: "block",
          targetId: block.id,
          data: { dates: res.skippedDates },
          at: now,
        });
      }
    }
    return count;
  });

  return report;
}
