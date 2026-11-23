import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutProvider } from "@/components/booking/CheckoutProvider";
import { readCheckout } from "../../../_lib/checkout-store";
import { getFacility } from "../../../_lib/engine";

// Checkout URLs carry a token: keep them out of search results and referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Wraps Your details, Payment and Review. The client provider here keeps
 * the card (in memory) while the renter moves between steps, and mounts
 * Stripe Elements when the facility takes real cards.
 */
export default async function CheckoutLayout(props: LayoutProps<"/book/[slug]/c/[checkoutToken]">) {
  const { slug, checkoutToken } = await props.params;
  const [facility, checkout] = await Promise.all([getFacility(slug), readCheckout(checkoutToken)]);
  if (!facility) notFound();

  return (
    <CheckoutProvider
      slug={slug}
      token={checkoutToken}
      payments={facility.payments}
      amountCents={checkout?.priceCents ?? null}
      brandColor={facility.brand.primary}
    >
      {props.children}
    </CheckoutProvider>
  );
}
