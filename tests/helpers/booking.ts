/**
 * Booking-flow shortcuts for tests. Import after `vi.mock("server-only", ...)`.
 */
import type { StaffContext } from "@/lib/types";
import { abandonCheckout, preparePayment, saveCheckoutDetails, startCheckout, submitRequest } from "@/server/booking/public";
import { atLocal } from "@/server/booking/core/time";
import type { SeededTenant } from "@/server/db/seed";

export const ZONE = "America/Chicago";
export const GOOD_CARD = "4242424242424242";
export const DECLINE_CARD = "4000000000000002";

/** Instant for a facility-local date and time ("2026-12-05", "10:00"). */
export function local(date: string, time: string): Date {
  const d = atLocal(date, time, ZONE);
  if (!d) throw new Error(`No such local time ${date} ${time}`);
  return d;
}

export function ownerCtx(t: SeededTenant): StaffContext {
  return { tenantId: t.tenantId, userId: t.ownerId, role: "owner" };
}

export function staffCtx(t: SeededTenant): StaffContext {
  if (!t.staffId) throw new Error("tenant has no staff user");
  return { tenantId: t.tenantId, userId: t.staffId, role: "staff" };
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  team?: string;
}

export const JORDAN: Customer = { name: "Jordan Avery", email: "jordan@example.com", phone: "405-555-0118", team: "Cimarron Kickers U11" };
export const SAM: Customer = { name: "Sam Patel", email: "sam@example.com", phone: "(405) 555-0123" };

/** Continue + Your details + Payment, stopping before Send request. */
export async function checkoutToCard(
  t: SeededTenant,
  code: string,
  date: string,
  time: string,
  minutes = 60,
  customer: Customer = JORDAN,
) {
  const start = await startCheckout(t.slug, {
    resourceId: t.resources[code],
    startsAt: local(date, time).toISOString(),
    durationMinutes: minutes,
  });
  if (!start.ok) throw new Error(`startCheckout ${code} ${date} ${time}: ${start.error}`);
  const token = start.hold.checkoutToken;
  const details = await saveCheckoutDetails(t.slug, token, { ...customer, waiverAccepted: true });
  if (!details.ok) throw new Error(`saveCheckoutDetails: ${details.error}`);
  const pay = await preparePayment(t.slug, token);
  if (!pay.ok) throw new Error(`preparePayment: ${pay.error}`);
  return { hold: start.hold, checkoutToken: token };
}

/** Full customer flow to a Requested booking. */
export async function requestBooking(
  t: SeededTenant,
  code: string,
  date: string,
  time: string,
  minutes = 60,
  customer: Customer = JORDAN,
) {
  const { hold, checkoutToken } = await checkoutToCard(t, code, date, time, minutes, customer);
  const res = await submitRequest(t.slug, { checkoutToken, fakeCardNumber: GOOD_CARD });
  if (!res.ok) throw new Error(`submitRequest: ${res.error}`);
  return { ...res, hold, checkoutToken };
}

export { abandonCheckout };
