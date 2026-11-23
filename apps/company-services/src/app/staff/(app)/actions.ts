"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StaffActionResult } from "@tymo/shared/types";
import { requireOwner, requireStaff, signOut } from "@tymo/platform/auth";
import {
  approveBooking,
  confirmFieldsAndPrices,
  declineBooking,
  setBookingsEnabled,
} from "@tymo/company/staff";

const bookingId = z.string().trim().min(1).max(100);
const reason = z.string().trim().max(500);

const invalid: StaffActionResult = { ok: false, error: "invalid", message: "That request couldn't be found. Refresh and try again." };

/** Everything under /staff shows queue state (the tab badge included). */
function refreshStaff() {
  revalidatePath("/staff", "layout");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/staff/login");
}

/** Sent by the client only after the 5-second undo window has passed. */
export async function approveRequestAction(id: string): Promise<StaffActionResult> {
  const session = await requireStaff();
  const parsed = bookingId.safeParse(id);
  if (!parsed.success) return invalid;
  const result = await approveBooking(session, parsed.data);
  refreshStaff();
  return result;
}

export async function declineRequestAction(id: string, why: string): Promise<StaffActionResult> {
  const session = await requireStaff();
  const parsedId = bookingId.safeParse(id);
  const parsedReason = reason.safeParse(why ?? "");
  if (!parsedId.success) return invalid;
  if (!parsedReason.success) {
    return { ok: false, error: "invalid", message: "Keep the reason under 500 characters." };
  }
  const result = await declineBooking(session, parsedId.data, parsedReason.data || undefined);
  refreshStaff();
  return result;
}

/** Owner: "Looks right" on the first-run checklist. */
export async function confirmFieldsAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireOwner();
  await confirmFieldsAndPrices(session);
  refreshStaff();
  return { ok: true, message: "Fields and prices confirmed." };
}

/** Owner: take the booking page live or off. */
export async function setBookingsEnabledAction(enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const session = await requireOwner();
  const result = await setBookingsEnabled(session, enabled === true);
  refreshStaff();
  return result;
}
