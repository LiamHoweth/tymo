import "server-only";
import type {
  ApprovalQueueItem,
  BlockInput,
  BlockListItem,
  BlockPreview,
  CalendarDay,
  CancelBookingInput,
  CreateBlockResult,
  SettingsView,
  SetupChecklist,
  StaffActionResult,
  StaffBookingDetail,
  StaffContext,
} from "@/lib/types";
import { notImplemented } from "@/server/not-implemented";

/**
 * Staff booking engine API. Callers pass a StaffContext from
 * requireStaff()/requireOwner(); every function runs inside
 * withTenant(ctx.tenantId) and writes an audit_log row for each change.
 * Role rules: staff may approve, decline, block, and cancel with a FULL
 * refund. Only owners may give partial/no refunds, edit prices, hours and
 * rules, manage payouts and invite staff.
 */

/** Waiting requests, soonest deadline first. */
export async function getApprovalQueue(ctx: StaffContext): Promise<ApprovalQueueItem[]> {
  return notImplemented("getApprovalQueue", ctx);
}

/** Capture the hold and move to approved (idempotent; a second tap is a no-op). */
export async function approveBooking(ctx: StaffContext, bookingId: string): Promise<StaffActionResult> {
  return notImplemented("approveBooking", ctx, bookingId);
}

/** Release the hold and move to declined, with an optional reason for the customer. */
export async function declineBooking(
  ctx: StaffContext,
  bookingId: string,
  reason?: string,
): Promise<StaffActionResult> {
  return notImplemented("declineBooking", ctx, bookingId, reason);
}

/** Facility cancellation. Staff: refund must be 'full'. Owner: full, partial or none. */
export async function cancelBooking(ctx: StaffContext, input: CancelBookingInput): Promise<StaffActionResult> {
  return notImplemented("cancelBooking", ctx, input);
}

export async function getBookingDetail(ctx: StaffContext, bookingId: string): Promise<StaffBookingDetail | null> {
  return notImplemented("getBookingDetail", ctx, bookingId);
}

export async function saveStaffNotes(ctx: StaffContext, bookingId: string, notes: string): Promise<void> {
  return notImplemented("saveStaffNotes", ctx, bookingId, notes);
}

/** Re-send the customer's private link email. */
export async function resendCustomerLink(ctx: StaffContext, bookingId: string): Promise<void> {
  return notImplemented("resendCustomerLink", ctx, bookingId);
}

/** Day view: one row per parent field with half lanes beneath. date = facility-local "YYYY-MM-DD". */
export async function getCalendarDay(ctx: StaffContext, date: string): Promise<CalendarDay> {
  return notImplemented("getCalendarDay", ctx, date);
}

/** Week view: seven CalendarDays starting at weekStart, optionally one field only. */
export async function getCalendarWeek(
  ctx: StaffContext,
  weekStart: string,
  resourceId?: string,
): Promise<CalendarDay[]> {
  return notImplemented("getCalendarWeek", ctx, weekStart, resourceId);
}

/** What saving this block would do: occurrences, overlap note, conflicting bookings. */
export async function previewBlock(ctx: StaffContext, input: BlockInput): Promise<BlockPreview> {
  return notImplemented("previewBlock", ctx, input);
}

/**
 * Save a block. Overlapping Requested/Approved bookings are never touched:
 * one_time/closure with conflicts fail with error 'conflicts'; weekly with
 * conflicts fails unless skipConflicts is true, in which case those dates
 * are added to skipDates. Checkout holds in the way are removed.
 */
export async function createBlock(
  ctx: StaffContext,
  input: BlockInput,
  options?: { skipConflicts?: boolean },
): Promise<CreateBlockResult> {
  return notImplemented("createBlock", ctx, input, options);
}

/** Remove one occurrence ('this'), this and later ('following'), or the whole block ('all'). */
export async function removeBlock(
  ctx: StaffContext,
  blockId: string,
  scope: "this" | "following" | "all",
  occurrenceDate?: string,
): Promise<{ ok: boolean; message: string }> {
  return notImplemented("removeBlock", ctx, blockId, scope, occurrenceDate);
}

export async function listBlocks(ctx: StaffContext): Promise<BlockListItem[]> {
  return notImplemented("listBlocks", ctx);
}

export async function getSetupChecklist(ctx: StaffContext): Promise<SetupChecklist> {
  return notImplemented("getSetupChecklist", ctx);
}

/** Owner: "Looks right" on fields and prices. */
export async function confirmFieldsAndPrices(ctx: StaffContext): Promise<void> {
  return notImplemented("confirmFieldsAndPrices", ctx);
}

/** Owner: turn the public booking page on or off (requires payouts connected to turn on). */
export async function setBookingsEnabled(
  ctx: StaffContext,
  enabled: boolean,
): Promise<{ ok: boolean; message: string }> {
  return notImplemented("setBookingsEnabled", ctx, enabled);
}

export async function getSettings(ctx: StaffContext): Promise<SettingsView> {
  return notImplemented("getSettings", ctx);
}

/** Owner only. */
export async function updateResourcePrice(
  ctx: StaffContext,
  resourceId: string,
  priceCentsPerHour: number,
): Promise<{ ok: boolean; message: string }> {
  return notImplemented("updateResourcePrice", ctx, resourceId, priceCentsPerHour);
}

/** Owner only: invite a staff member (sends a sign-in link). */
export async function inviteStaff(
  ctx: StaffContext,
  input: { name: string; email: string; role: "owner" | "staff" },
): Promise<{ ok: boolean; message: string }> {
  return notImplemented("inviteStaff", ctx, input);
}
