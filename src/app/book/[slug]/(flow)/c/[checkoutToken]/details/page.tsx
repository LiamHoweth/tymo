import type { Metadata } from "next";
import { SentGuard } from "@/components/booking/CheckoutProvider";
import { AlreadySent, CheckoutGone } from "@/components/booking/CheckoutStates";
import { DetailsForm } from "@/components/booking/DetailsForm";
import { BackButton, StepHeader } from "@/components/booking/StepChrome";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { formatCents } from "@/lib/format";
import { leaveCheckout, saveDetails } from "../../../../actions";
import { readDetails } from "../../../../_lib/checkout-store";
import { loadCheckoutPage } from "../../../../_lib/checkout-page";

export const metadata: Metadata = { title: "Your details" };

/** Step 3 of 5: only what the front desk needs to recognize and reach the renter. */
export default async function YourDetails(props: PageProps<"/book/[slug]/c/[checkoutToken]/details">) {
  const { slug, checkoutToken } = await props.params;
  const page = await loadCheckoutPage(slug, checkoutToken);
  if (page.kind === "gone") return <CheckoutGone facility={page.facility} />;
  if (page.kind === "sent") return <AlreadySent facility={page.facility} bookingHref={page.bookingHref} />;

  const { facility, checkout, range } = page;
  const kept = await readDetails();
  const leave = leaveCheckout.bind(null, slug, checkoutToken, "times");

  return (
    <SentGuard>
      <StepHeader
        facility={facility}
        step={3}
        title={[[{ text: "Your" }, { text: "details", outline: true }]]}
        back={<BackButton action={leave}>Change time</BackButton>}
      >
        So the front desk knows who&apos;s coming and how to reach you.
      </StepHeader>
      <DetailsForm
        action={saveDetails.bind(null, slug, checkoutToken)}
        leaveAction={leave}
        initial={{
          name: kept?.name ?? "",
          phone: kept?.phone ?? "",
          email: kept?.email ?? "",
          team: kept?.team ?? "",
          waiverAccepted: Boolean(checkout.waiverAccepted),
        }}
        facilityName={facility.name}
        waiverText={facility.waiverText}
        waiverVersion={facility.waiverVersion}
        summary={{
          title: checkout.resourceName,
          when: checkout.whenLabel,
          price: formatCents(checkout.priceCents),
          expiresAt: checkout.expiresAt,
        }}
        range={range}
      />
      <FacilityFooter facility={facility} barSpace />
    </SentGuard>
  );
}
