import type { Metadata } from "next";
import { SentGuard } from "@/components/booking/CheckoutProvider";
import { AlreadySent, CheckoutGone } from "@/components/booking/CheckoutStates";
import { callTheDesk } from "@/components/booking/copy";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { ReviewStep } from "@/components/booking/ReviewStep";
import { BackLink, StepHeader } from "@/components/booking/StepChrome";
import { dayAndTime, freeCancelUntil, insideCancelCutoff, longDay, spanWords, wordsRange } from "@/components/booking/time";
import { formatCents, formatPhone } from "@tymo/shared/format";
import { leaveCheckout, sendRequest } from "../../../../actions";
import { readDetails } from "../../../../_lib/checkout-store";
import { loadCheckoutPage } from "../../../../_lib/checkout-page";

export const metadata: Metadata = { title: "Review and send" };

/** Step 5 of 5: what they're agreeing to, with the cancellation policy above the button. */
export default async function ReviewAndSend(props: PageProps<"/book/[slug]/c/[checkoutToken]/review">) {
  const { slug, checkoutToken } = await props.params;
  const search = await props.searchParams;
  const page = await loadCheckoutPage(slug, checkoutToken);
  if (page.kind === "gone") return <CheckoutGone facility={page.facility} />;
  if (page.kind === "sent") return <AlreadySent facility={page.facility} bookingHref={page.bookingHref} />;

  const { facility, checkout } = page;
  const zone = facility.timeZone;
  const kept = await readDetails();
  const price = formatCents(checkout.priceCents);
  const base = `/book/${slug}/c/${checkoutToken}`;

  const cancellationBox = [
    insideCancelCutoff(checkout.startsAt, facility.cancelCutoffMinutes)
      ? `This booking starts within ${spanWords(facility.cancelCutoffMinutes)}, so it can't be cancelled online. To cancel, ${callTheDesk(facility)}.`
      : `Free cancellation until ${dayAndTime(freeCancelUntil(checkout.startsAt, facility.cancelCutoffMinutes), zone)} ${facility.timeZoneLabel}. After that, call the front desk.`,
    `If ${facility.name} cancels, you get a full refund.`,
    facility.cancellationPolicyText,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SentGuard>
      <StepHeader
        facility={facility}
        step={5}
        title={[[{ text: "Review and" }, { text: "send", outline: true }]]}
        back={<BackLink href={`${base}/payment`}>Card</BackLink>}
      >
        Check everything once. Nothing is charged until {facility.name} confirms.
      </StepHeader>
      <ReviewStep
        sendAction={sendRequest.bind(null, slug, checkoutToken)}
        leaveAction={leaveCheckout.bind(null, slug, checkoutToken, "times")}
        whenLine={`${checkout.resourceName}, ${longDay(checkout.startsAt, zone)}, ${wordsRange(checkout.startsAt, checkout.endsAt, zone)} ${facility.timeZoneLabel}`}
        priceLine={`${price}, charged when ${facility.name} confirms`}
        personLine={kept ? [kept.name, kept.team].filter(Boolean).join(" · ") : "Your details are saved"}
        contactLine={kept ? `${formatPhone(kept.phone)} · ${kept.email}` : "Tap Edit to check them."}
        cancellationBox={cancellationBox}
        responseBox="The front desk usually answers within a day. If they don't answer in time, the request expires and the hold drops off. Your confirmation email has the exact deadline."
        detailsHref={`${base}/details`}
        paymentHref={`${base}/payment`}
        summary={{ title: checkout.resourceName, when: checkout.whenLabel, price, expiresAt: checkout.expiresAt }}
        alreadyConfirmed={search.redirect_status === "succeeded"}
      />
      <FacilityFooter facility={facility} barSpace />
    </SentGuard>
  );
}
