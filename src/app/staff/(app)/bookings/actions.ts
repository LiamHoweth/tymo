"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CancelBookingInput, StaffActionResult } from "@/lib/types";
import { requireStaff } from "@/server/auth";
import { cancelBooking, resendCustomerLink, saveStaffNotes } from "@/server/booking/staff";

const bookingId = z.string().trim().min(1).max(100);

const cancelInput = z.object({
  bookingId,
  refund: z.enum(["full", "partial", "none"]),
  amountCents: z.number().int().positive().max(10_000_000).optional(),
  message: z.string().trim().max(1000).optional(),
});

export async function cancelBookingAction(input: CancelBookingInput): Promise<StaffActionResult> {
  const session = await requireStaff();
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: "Check the refund amount and try again." };
  const data = parsed.data;
  // Staff cancel with a full refund only; the engine enforces this too.
  if (data.refund !== "full" && session.role !== "owner") {
    return { ok: false, error: "forbidden", message: "Only the owner can give a partial refund or none." };
  }
  if (data.refund === "partial" && !data.amountCents) {
    return { ok: false, error: "invalid", message: "Enter the amount to refund." };
  }
  const result = await cancelBooking(session, {
    bookingId: data.bookingId,
    refund: data.refund,
    amountCents: data.refund === "partial" ? data.amountCents : undefined,
    message: data.message || undefined,
  });
  revalidatePath("/staff", "layout");
  return result;
}

export async function saveNotesAction(id: string, notes: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireStaff();
  const parsedId = bookingId.safeParse(id);
  const parsedNotes = z.string().max(5000).safeParse(notes ?? "");
  if (!parsedId.success) return { ok: false, message: "That booking couldn't be found." };
  if (!parsedNotes.success) return { ok: false, message: "Notes can be up to 5,000 characters." };
  await saveStaffNotes(session, parsedId.data, parsedNotes.data.trim());
  revalidatePath(`/staff/bookings/${parsedId.data}`);
  return { ok: true, message: "Notes saved." };
}

export async function resendLinkAction(id: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireStaff();
  const parsedId = bookingId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: "That booking couldn't be found." };
  await resendCustomerLink(session, parsedId.data);
  revalidatePath(`/staff/bookings/${parsedId.data}`);
  return { ok: true, message: "Link sent." };
}
