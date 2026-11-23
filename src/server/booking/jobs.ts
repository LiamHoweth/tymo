import "server-only";
import { notImplemented } from "@/server/not-implemented";

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
  return notImplemented("runSweep", now);
}
