"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { CancelResult, ContinueState, DetailsState, SendResult } from "@/components/booking/action-types";
import {
  cancelErrorCopy,
  startCheckoutErrorCopy,
  submitErrorCopy,
} from "@/components/booking/copy";
import { compactRange, clock } from "@/components/booking/time";
import { phoneDigits, validateDetails, type DetailsValues } from "@/components/booking/validate";
import { formatCents } from "@/lib/format";
import {
  checkoutFromHold,
  clearCheckout,
  readCheckout,
  updateCheckout,
  writeCheckout,
  writeDetails,
} from "./_lib/checkout-store";
import * as engine from "./_lib/engine";

const str = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

async function facilityOrHome(slug: string) {
  const facility = await engine.getFacility(slug);
  if (!facility) redirect("/");
  return facility;
}

const paths = {
  details: (slug: string, token: string) => `/book/${slug}/c/${token}/details`,
  payment: (slug: string, token: string) => `/book/${slug}/c/${token}/payment`,
  booking: (slug: string, token: string, sent?: boolean) => `/book/${slug}/b/${token}${sent ? "?sent=1" : ""}`,
  times: (slug: string, resourceId: string, date?: string, dur?: number) => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (dur) q.set("dur", String(dur));
    const qs = q.toString();
    return `/book/${slug}/r/${resourceId}${qs ? `?${qs}` : ""}`;
  },
};

/** Date and time -> Continue: soft-hold the slot, then go to Your details. */
export async function continueToCheckout(slug: string, prev: ContinueState, data: FormData): Promise<ContinueState> {
  const facility = await facilityOrHome(slug);
  const resourceId = str(data, "resourceId");
  const startsAt = str(data, "startsAt");
  const date = str(data, "date");
  const durationMinutes = Number(str(data, "durationMinutes"));
  const range = compactRange(str(data, "startLocal") || clock(startsAt, facility.timeZone), str(data, "endLocal"));
  const attempt = prev.attempt + 1;

  if (!resourceId || !startsAt || !Number.isFinite(durationMinutes)) {
    return { error: "Pick a start time first.", attempt };
  }

  let result;
  try {
    result = await engine.startCheckout(slug, { resourceId, startsAt, durationMinutes });
  } catch {
    return { error: "Couldn't hold that time. Check your signal and try again.", attempt };
  }

  if (!result.ok) {
    // Someone else got there first: re-render so the time reads "Not available".
    if (result.error === "slot_taken") refresh();
    return { error: startCheckoutErrorCopy(result.error, facility, range), attempt };
  }

  await writeCheckout(slug, checkoutFromHold(result.hold, date, durationMinutes));
  redirect(paths.details(slug, result.hold.checkoutToken));
}

/** Your details -> Continue. Typed details are kept even if the hold ran out. */
export async function saveDetails(slug: string, token: string, prev: DetailsState, data: FormData): Promise<DetailsState> {
  const attempt = prev.attempt + 1;
  const values: DetailsValues = {
    name: str(data, "name").trim(),
    phone: str(data, "phone").trim(),
    email: str(data, "email").trim(),
    team: str(data, "team").trim(),
    waiverAccepted: data.get("waiverAccepted") === "on",
  };
  await writeDetails(slug, { name: values.name, phone: values.phone, email: values.email, team: values.team });

  const fieldErrors = validateDetails(values);
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: null, holdExpired: false, attempt };

  let result;
  try {
    result = await engine.saveCheckoutDetails(slug, token, {
      name: values.name,
      email: values.email,
      phone: phoneDigits(values.phone),
      team: values.team || undefined,
      waiverAccepted: values.waiverAccepted,
    });
  } catch {
    return { fieldErrors: {}, error: "Couldn't save your details. Check your signal and try again.", holdExpired: false, attempt };
  }

  if (!result.ok) {
    if (result.error === "hold_expired") return { fieldErrors: {}, error: null, holdExpired: true, attempt };
    return {
      fieldErrors: result.fieldErrors ?? {},
      error: result.fieldErrors ? null : "Something in your details didn't work. Check them and try again.",
      holdExpired: false,
      attempt,
    };
  }

  await updateCheckout(slug, token, { waiverAccepted: true });
  redirect(paths.payment(slug, token));
}

/**
 * Review -> Send request. For Stripe the browser has already confirmed the
 * card hold; the engine verifies it. Idempotent per checkout token, so
 * "Check again" after a dropped connection never sends twice.
 */
export async function sendRequest(slug: string, token: string, input: { fakeCardNumber?: string }): Promise<SendResult> {
  const facility = await facilityOrHome(slug);
  const checkout = await readCheckout(token);
  const range = checkout
    ? compactRange(clock(checkout.startsAt, facility.timeZone), clock(checkout.endsAt, facility.timeZone))
    : "this time";

  const result = await engine.submitRequest(slug, { checkoutToken: token, fakeCardNumber: input.fakeCardNumber });

  if (result.ok) {
    await updateCheckout(slug, token, { sentPublicToken: result.publicToken });
    return { ok: true, href: paths.booking(slug, result.publicToken, true) };
  }
  if (result.error === "already_submitted" && result.publicToken) {
    await updateCheckout(slug, token, { sentPublicToken: result.publicToken });
    return { ok: false, error: result.error, message: submitErrorCopy(result.error, range), href: paths.booking(slug, result.publicToken) };
  }
  return { ok: false, error: result.error, message: submitErrorCopy(result.error, range, result.message) };
}

/** Leave checkout (change time or field): release the hold, then go back. */
export async function leaveCheckout(slug: string, token: string, to: "times" | "fields"): Promise<void> {
  const checkout = await readCheckout(token);
  try {
    await engine.abandonCheckout(slug, token);
  } catch {
    // The hold also lapses on its own after the checkout window.
  }
  await clearCheckout(slug, token);
  if (to === "times" && checkout) redirect(paths.times(slug, checkout.resourceId, checkout.date, checkout.durationMinutes));
  redirect(`/book/${slug}/fields`);
}

/** Private booking page -> Cancel. */
export async function cancelBooking(slug: string, publicToken: string): Promise<CancelResult> {
  const facility = await facilityOrHome(slug);
  const booking = await engine.getBookingByToken(slug, publicToken);
  const result = await engine.cancelByToken(slug, publicToken);
  if (!result.ok) return { ok: false, message: cancelErrorCopy(result.error, facility) };
  refresh();
  if (booking?.status === "requested") return { ok: true, message: "Request cancelled. You weren't charged." };
  if (result.refundedCents > 0) {
    const card = booking?.cardLabel ? `your ${booking.cardLabel}` : "your card";
    return {
      ok: true,
      message: `Booking cancelled. ${formatCents(result.refundedCents)} is on its way back to ${card}. Allow 5 to 10 business days.`,
    };
  }
  return { ok: true, message: "Booking cancelled." };
}
