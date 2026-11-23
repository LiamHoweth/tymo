import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { PreparePaymentResult } from "@tymo/shared/types";
import { SentGuard } from "@/components/booking/CheckoutProvider";
import { AlreadySent, CheckoutGone } from "@/components/booking/CheckoutStates";
import { callTheDesk } from "@/components/booking/copy";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { PaymentStep, type PaymentProblem } from "@/components/booking/PaymentStep";
import { BackLink, StepHeader } from "@/components/booking/StepChrome";
import { formatCents } from "@tymo/shared/format";
import { leaveCheckout } from "../../../../actions";
import { readDetails } from "../../../../_lib/checkout-store";
import { loadCheckoutPage } from "../../../../_lib/checkout-page";
import { preparePayment } from "../../../../_lib/engine";

export const metadata: Metadata = { title: "Add a card" };

/** Step 4 of 5: card field (Stripe Payment Element, or a test-mode field). */
export default async function Payment(props: PageProps<"/book/[slug]/c/[checkoutToken]/payment">) {
  const { slug, checkoutToken } = await props.params;
  const page = await loadCheckoutPage(slug, checkoutToken);
  if (page.kind === "gone") return <CheckoutGone facility={page.facility} />;
  if (page.kind === "sent") return <AlreadySent facility={page.facility} bookingHref={page.bookingHref} />;

  const { facility, checkout, range } = page;
  const detailsHref = `/book/${slug}/c/${checkoutToken}/details`;

  let prepared: PreparePaymentResult | null = null;
  try {
    prepared = await preparePayment(slug, checkoutToken);
  } catch {
    prepared = null;
  }
  if (prepared && !prepared.ok && prepared.error === "missing_details") redirect(detailsHref);

  let problem: PaymentProblem = null;
  let problemMessage: string | undefined;
  if (!prepared) problem = "load_failed";
  else if (!prepared.ok) {
    problem = prepared.error === "hold_expired" ? "hold_expired" : "load_failed";
    if (prepared.error === "payment_error" && prepared.message) problemMessage = `${prepared.message.replace(/\.?$/, ".")} Try again.`;
  }

  const kept = await readDetails();
  const price = formatCents(checkout.priceCents);

  return (
    <SentGuard>
      <StepHeader
        facility={facility}
        step={4}
        title={[[{ text: "Add a" }, { text: "card", outline: true }]]}
        back={<BackLink href={detailsHref}>Your details</BackLink>}
      >
        Your card is held with the request, not charged.
      </StepHeader>
      <PaymentStep
        mode={prepared?.ok ? prepared.mode : facility.payments.mode}
        clientSecret={prepared?.ok && prepared.mode === "stripe" ? prepared.clientSecret : null}
        problem={problem}
        problemMessage={problemMessage}
        facilityName={facility.name}
        priceLabel={price}
        summary={{ title: checkout.resourceName, when: checkout.whenLabel, price, expiresAt: checkout.expiresAt }}
        range={range}
        reviewHref={`/book/${slug}/c/${checkoutToken}/review`}
        billing={{ name: kept?.name ?? "", email: kept?.email ?? "" }}
        leaveAction={leaveCheckout.bind(null, slug, checkoutToken, "times")}
        callLine={`To book, ${callTheDesk(facility)}.`}
      />
      <FacilityFooter facility={facility} barSpace />
    </SentGuard>
  );
}

