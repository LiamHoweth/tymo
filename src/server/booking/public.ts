import "server-only";
import type {
  BookingPublicView,
  CancelByTokenResult,
  CustomerDetailsInput,
  DateChip,
  DayAvailability,
  FacilityPublic,
  FieldGroup,
  PreparePaymentResult,
  SaveDetailsResult,
  StartCheckoutResult,
  SubmitRequestInput,
  SubmitRequestResult,
} from "@/lib/types";
import { notImplemented } from "@/server/not-implemented";

/**
 * Public (customer-facing) booking engine API. Every function resolves the
 * facility by slug, then runs inside withTenant(). Owned by the booking
 * engine module; the UI calls these from server actions / server components.
 */

/** Facility branding and rules for /book/[slug]. null if no such slug. */
export async function getFacility(slug: string): Promise<FacilityPublic | null> {
  return notImplemented("getFacility", slug);
}

/** Landing + Choose field: groups of field cards with full/half options. */
export async function getFieldGroups(slug: string): Promise<FieldGroup[]> {
  return notImplemented("getFieldGroups", slug);
}

/** Date strip: the next `days` facility-local dates from today. */
export async function getDateChips(slug: string, resourceId: string, days?: number): Promise<DateChip[]> {
  return notImplemented("getDateChips", slug, resourceId, days);
}

/**
 * Start times for one resource, date and duration. A slot is available
 * only when every unit the resource occupies is free for the whole
 * duration plus buffer, within hours, lead time and booking window.
 */
export async function getDayAvailability(
  slug: string,
  resourceId: string,
  date: string,
  durationMinutes: number,
): Promise<DayAvailability> {
  return notImplemented("getDayAvailability", slug, resourceId, date, durationMinutes);
}

/** Continue on Date and time: soft-hold the slot for checkoutHoldMinutes. */
export async function startCheckout(
  slug: string,
  input: { resourceId: string; startsAt: string; durationMinutes: number },
): Promise<StartCheckoutResult> {
  return notImplemented("startCheckout", slug, input);
}

/** Your details: customer, team, waiver acceptance (time + version). */
export async function saveCheckoutDetails(
  slug: string,
  checkoutToken: string,
  details: CustomerDetailsInput,
): Promise<SaveDetailsResult> {
  return notImplemented("saveCheckoutDetails", slug, checkoutToken, details);
}

/** Payment step: create the manual-capture payment on the facility's account. */
export async function preparePayment(slug: string, checkoutToken: string): Promise<PreparePaymentResult> {
  return notImplemented("preparePayment", slug, checkoutToken);
}

/**
 * Send request: verify the hold is still ours, verify the card is
 * authorized (Stripe: PaymentIntent requires_capture; fake: simulate),
 * move to `requested`, set the approval deadline, mint the private link,
 * and notify the customer and staff. Idempotent per checkout token.
 */
export async function submitRequest(slug: string, input: SubmitRequestInput): Promise<SubmitRequestResult> {
  return notImplemented("submitRequest", slug, input);
}

/** Leave checkout early (Back to fields): release the hold and cancel any payment. */
export async function abandonCheckout(slug: string, checkoutToken: string): Promise<void> {
  return notImplemented("abandonCheckout", slug, checkoutToken);
}

/** The customer's private booking page. null if the token is unknown or expired. */
export async function getBookingByToken(slug: string, publicToken: string): Promise<BookingPublicView | null> {
  return notImplemented("getBookingByToken", slug, publicToken);
}

/** Cancel from the private link: release (requested) or refund per policy (approved). */
export async function cancelByToken(slug: string, publicToken: string): Promise<CancelByTokenResult> {
  return notImplemented("cancelByToken", slug, publicToken);
}
