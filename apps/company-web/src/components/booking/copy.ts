import type { BookingPublicView, CancelByTokenResult, FacilityPublic, StartCheckoutError, SubmitRequestResult } from "@tymo/shared/types";
import { formatCents, formatPhone } from "@tymo/shared/format";
import { addDays, dateWithYear, noticeWords, spanWords, todayIn } from "./time";

/**
 * Every customer-facing message in the booking flow, keyed by the engine's
 * error codes. Each one says what happened, whether money moved, and what
 * to do next (spec: "Every state, in the customer's words").
 */

type Facility = Pick<
  FacilityPublic,
  "name" | "contactPhone" | "leadTimeMinutes" | "bookingWindowDays" | "timeZone" | "cancelCutoffMinutes"
>;

export function deskPhone(f: Pick<FacilityPublic, "contactPhone">): string | null {
  return f.contactPhone ? formatPhone(f.contactPhone) : null;
}

/** "call the front desk at (580) 555-0142" */
export function callTheDesk(f: Pick<FacilityPublic, "contactPhone">): string {
  const phone = deskPhone(f);
  return phone ? `call the front desk at ${phone}` : "call the front desk";
}

export function bookingsOffCopy(f: Pick<FacilityPublic, "contactPhone">): string {
  return `Online booking is not open yet. ${capitalize(callTheDesk(f))}.`;
}

export function tooSoonCopy(f: Facility): string {
  const phone = deskPhone(f);
  return `Requests need ${noticeWords(f.leadTimeMinutes)} notice. For sooner, ${phone ? `call ${phone}` : "call the front desk"}.`;
}

export function tooFarCopy(f: Facility): string {
  const limit = addDays(todayIn(f.timeZone), f.bookingWindowDays, f.timeZone);
  return `You can book up to ${f.bookingWindowDays} days ahead. Pick a date before ${dateWithYear(limit, f.timeZone)}.`;
}

/** Shown in the sticky bar when Continue fails. `range` is "5:00–6:30 PM". */
export function startCheckoutErrorCopy(error: StartCheckoutError, f: Facility, range: string): string {
  switch (error) {
    case "slot_taken":
      return `${range} was just taken. Pick another time.`;
    case "too_soon":
      return tooSoonCopy(f);
    case "too_far":
      return tooFarCopy(f);
    case "closed":
      return "That day is closed. Pick another date.";
    case "outside_hours":
      return `${range} is outside opening hours. Pick another time.`;
    case "bookings_off":
      return bookingsOffCopy(f);
    case "invalid":
    default:
      return "That time can't be booked. Pick another time.";
  }
}

export function holdRanOutCopy(range: string): string {
  return `Your hold on ${range} ran out and the time is no longer available. You haven't been charged. Pick another time; we kept your details.`;
}

export const CARD_DECLINED_COPY = "Your card was declined. Try another card, or call the number on the back of yours.";
export const LOAD_FAILED_COPY = "Couldn't load. Check your signal and try again.";
export const SEND_DROPPED_COPY =
  "Your connection dropped. Tap Check again to see if it went through. It won't send twice.";
export const ALREADY_SENT_COPY = "This request is already sent.";

export type SubmitErrorCode = Extract<SubmitRequestResult, { ok: false }>["error"];

export function submitErrorCopy(error: SubmitErrorCode, range: string, message?: string): string {
  switch (error) {
    case "hold_expired":
      return holdRanOutCopy(range);
    case "card_declined":
      return CARD_DECLINED_COPY;
    case "card_not_confirmed":
      return "We couldn't confirm your card. You haven't been charged. Add your card again.";
    case "already_submitted":
      return ALREADY_SENT_COPY;
    case "invalid":
      return "Some of your details are missing. Check them and send again.";
    case "payment_error":
    default:
      return `${message ? `${message.replace(/\.?$/, ".")} ` : "The card check didn't go through. "}You haven't been charged. Try again.`;
  }
}

export function cancelErrorCopy(
  error: Extract<CancelByTokenResult, { ok: false }>["error"],
  f: Pick<FacilityPublic, "contactPhone" | "cancelCutoffMinutes">,
): string {
  switch (error) {
    case "past_cutoff":
      return `It's less than ${spanWords(f.cancelCutoffMinutes)} before your booking. To cancel, ${callTheDesk(f)}.`;
    case "not_cancellable":
      return `This booking can't be cancelled online anymore. To make changes, ${callTheDesk(f)}.`;
    case "not_found":
      return `We can't find this booking. ${capitalize(callTheDesk(f))}.`;
    case "payment_error":
    default:
      return `We couldn't cancel it just now, and nothing changed. Try again, or ${callTheDesk(f)}.`;
  }
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tone for a customer status word. Status is always written out too. */
export function statusTone(label: BookingPublicView["statusLabel"]): "ok" | "warn" | "neutral" | "danger" {
  switch (label) {
    case "Booked":
      return "ok";
    case "Requested":
      return "warn";
    case "Not booked":
      return "danger";
    default:
      return "neutral";
  }
}

/** Short refund phrase: "Refunded $120.00". */
export function refundedLabel(cents: number): string | null {
  return cents > 0 ? `Refunded ${formatCents(cents)}` : null;
}
