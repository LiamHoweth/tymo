import "server-only";
import { notFound } from "next/navigation";
import type { FacilityPublic } from "@/lib/types";
import { clock, compactRange } from "@/components/booking/time";
import { readCheckout, type CheckoutState } from "./checkout-store";
import { getFacility } from "./engine";

export type CheckoutPage =
  | { kind: "gone"; facility: FacilityPublic }
  | { kind: "sent"; facility: FacilityPublic; bookingHref: string }
  | { kind: "ok"; facility: FacilityPublic; checkout: CheckoutState; range: string };

/** Shared start of every checkout step: facility, checkout state, and the "5:00–6:30 PM" range. */
export async function loadCheckoutPage(slug: string, token: string): Promise<CheckoutPage> {
  const facility = await getFacility(slug);
  if (!facility) notFound();
  const checkout = await readCheckout(token);
  if (!checkout) return { kind: "gone", facility };
  if (checkout.sentPublicToken) {
    return { kind: "sent", facility, bookingHref: `/book/${slug}/b/${checkout.sentPublicToken}` };
  }
  const range = compactRange(clock(checkout.startsAt, facility.timeZone), clock(checkout.endsAt, facility.timeZone));
  return { kind: "ok", facility, checkout, range };
}
