import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireBookingAccess } from "@/app/_lib/public-preview";
import type { BookingPublicView } from "@tymo/shared/types";
import { ButtonLink, Display, Spark, StatusTag, type DisplayLine } from "@tymo/ui";
import { CancelSection } from "@/components/booking/CancelSection";
import { callTheDesk, capitalize, refundedLabel, statusTone } from "@/components/booking/copy";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { FacilityMark } from "@/components/booking/FacilityMark";
import { shortDay, spanWords } from "@/components/booking/time";
import { cn } from "@tymo/shared/cn";
import { formatCents } from "@tymo/shared/format";
import { cancelBooking } from "../../actions";
import { getBookingByToken } from "../../_lib/engine";

// The URL is the key to this booking: keep it out of search results and referrers.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** What the status means, whether money moved, and what to do next. */
function statusStory(b: BookingPublicView): { title: DisplayLine[]; lines: string[] } {
  const f = b.facility;
  const card = b.cardLabel ? `your ${b.cardLabel}` : "your card";
  const firstName = b.customerName.split(" ")[0] || b.customerName;
  const refund = b.amountRefundedCents;
  const refundWords =
    refund > 0
      ? refund >= b.priceCents
        ? `We refunded all ${formatCents(refund)} to ${card}; allow 5 to 10 business days.`
        : `We refunded ${formatCents(refund)} to ${card}; allow 5 to 10 business days.`
      : null;

  switch (b.status) {
    case "requested":
      return {
        title: [[{ text: "Requested" }]],
        lines: [
          `${f.name} has your request. You haven't been charged.`,
          b.approvalDeadlineLabel
            ? `No answer by ${b.approvalDeadlineLabel}? The request expires and the hold drops off.`
            : "If they don't answer in time, the request expires and the hold drops off.",
        ],
      };
    case "approved":
      return {
        title: [[{ text: "You're" }, { text: "booked", outline: true }]],
        lines: [`${f.name} confirmed your booking. We charged ${formatCents(b.priceCents)} to ${card}.`, "Check in at the front desk."],
      };
    case "completed":
      return {
        title: [[{ text: "Booked" }]],
        lines: [`This booking has ended. We charged ${formatCents(b.priceCents)} to ${card}.`],
      };
    case "declined":
      return {
        title: [[{ text: "Not" }, { text: "booked", outline: true }]],
        lines: [
          `${f.name} can't take your request. You haven't been charged.`,
          ...(b.declineReason ? [`Their note: ${b.declineReason}`] : []),
        ],
      };
    case "payment_failed":
      return {
        title: [[{ text: "Not" }, { text: "booked", outline: true }]],
        lines: ["Not booked: card didn't go through. The time was released and you weren't charged. You can book again."],
      };
    case "expired":
      return {
        title: [[{ text: "Expired" }]],
        lines: [`${f.name} didn't answer in time. You haven't been charged.`, `To try again, ${callTheDesk(f)}, or book another time.`],
      };
    case "cancelled_by_customer":
      return {
        title: [[{ text: "Cancelled" }]],
        lines: [refund > 0 ? `You cancelled this booking. ${refundWords}` : "You cancelled your request. You weren't charged."],
      };
    case "cancelled_by_facility":
      return {
        title: [[{ text: "Cancelled" }]],
        lines: [
          `Sorry, ${firstName}. ${f.name} had to cancel.`,
          ...(b.cancelReason ? [`Their note: ${b.cancelReason}`] : []),
          ...(refundWords ? [refundWords] : ["You weren't charged."]),
        ],
      };
    default:
      return {
        title: [[{ text: "Not" }, { text: "booked", outline: true }]],
        lines: ["This request was never sent. You haven't been charged."],
      };
  }
}

/** The customer's private booking page: status in words, details, refunds, cancel. */
export default async function BookingPage(props: PageProps<"/book/[slug]/b/[publicToken]">) {
  requireBookingAccess();
  const { slug, publicToken } = await props.params;
  const search = await props.searchParams;
  const booking = await getBookingByToken(slug, publicToken);
  if (!booking) notFound();

  const f = booking.facility;
  const justSent = first(search.sent) === "1" && booking.status === "requested";
  const story = statusStory(booking);
  const refunded = refundedLabel(booking.amountRefundedCents);
  const day = shortDay(booking.startsAt, f.timeZone);
  const final = booking.cancelMode === "none";
  const bookAgainHref = `/book/${slug}/fields`;

  const sheetTitle =
    booking.cancelMode === "request" ? `Cancel your request for ${day}?` : `Cancel ${booking.resourceName} on ${day}?`;
  const sheetBody =
    booking.cancelMode === "request"
      ? "You haven't been charged."
      : `We'll refund ${formatCents(booking.refundIfCancelledCents)} to ${booking.cardLabel ? `your ${booking.cardLabel}` : "your card"}.`;
  const policyText =
    booking.cancelMode === "request"
      ? "You can cancel until the front desk answers. You haven't been charged."
      : booking.freeCancelUntilLabel
        ? `Free cancellation until ${booking.freeCancelUntilLabel}. After that, call the front desk.`
        : null;
  const callText = `It's less than ${spanWords(f.cancelCutoffMinutes)} before your booking. To cancel, ${callTheDesk(f)}.`;

  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="court-grid text-white">
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-3 sm:px-6 lg:pb-16">
            <Link href={`/book/${slug}`} className="inline-flex min-h-11 items-center gap-2.5">
              <FacilityMark facility={f} size="sm" />
              <span className="text-[14px] font-semibold">{f.name}</span>
            </Link>
            <div className="rise-in mt-8 lg:mt-14">
              <Spark className="mb-5 h-7 w-7" />
              {justSent ? (
                <>
                  <Display size="xl" lines={[[{ text: "Request" }, { text: "sent", outline: true }]]} />
                  <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/85">
                    We emailed the details to <span className="font-semibold text-white">{booking.customerEmail}</span>.
                  </p>
                </>
              ) : (
                <>
                  <p className="kicker mb-4 text-white/70">Your booking</p>
                  <Display size="xl" lines={story.title} />
                </>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-12 lg:py-14">
          <section
            aria-labelledby="booking-card-title"
            // Just sent: on phones, "What happens next" leads and the card follows.
            className={cn("lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1", justSent && "order-2 lg:order-none")}
          >
            <div className="ink-card rounded-[24px] p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag tone={statusTone(booking.statusLabel)}>
                  {booking.statusLabel}
                </StatusTag>
                {refunded ? (
                  <StatusTag tone="neutral">
                    {refunded}
                  </StatusTag>
                ) : null}
              </div>
              <h2 id="booking-card-title" className="display mt-5 text-[1.75rem] leading-[0.95]">
                {booking.resourceName}
              </h2>
              <p className="mt-3 text-[15px] leading-snug text-white/85">{booking.whenLabel}</p>
              <dl className="mt-5 divide-y divide-white/10 border-t border-white/10 text-[14px]">
                <CardRow label="Price">
                  {formatCents(booking.priceCents)}
                  {booking.status === "requested" ? <span className="block text-white/60">Charged when {f.name} confirms</span> : null}
                </CardRow>
                {booking.cardLabel ? <CardRow label="Card">{booking.cardLabel}</CardRow> : null}
                <CardRow label="Name">{[booking.customerName, booking.team].filter(Boolean).join(" · ")}</CardRow>
                <CardRow label="Email">{booking.customerEmail}</CardRow>
              </dl>
            </div>
          </section>

          <div className="rise-in min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
            {justSent ? (
              <section aria-labelledby="next-title">
                <h2 id="next-title" className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-text">
                  What happens next
                </h2>
                <ol className="space-y-3">
                  {[
                    "The front desk reviews it, usually within a day.",
                    `If they confirm, we charge ${formatCents(booking.priceCents)} and email your receipt.`,
                    "If they can't, or don't answer in time, you aren't charged.",
                  ].map((line, i) => (
                    <li key={line} className="flex gap-4 rounded-2xl border border-line bg-white px-4 py-3.5">
                      <span className="display w-6 shrink-0 text-[1.2rem] leading-[1.35] text-brand">{i + 1}</span>
                      <span className="text-[15px] leading-relaxed text-text">{line}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ButtonLink href={`/book/${slug}/b/${publicToken}#manage`} variant="ink">
                    View or cancel request
                  </ButtonLink>
                  <ButtonLink href={bookAgainHref} variant="ghost">
                    Book another time
                  </ButtonLink>
                </div>
              </section>
            ) : (
              <section aria-label="Status" className="space-y-2 text-[17px] leading-relaxed text-text">
                {story.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </section>
            )}

            <section id="manage" aria-label="Manage booking" className="scroll-mt-6 space-y-4">
              <CancelSection
                mode={booking.cancelMode}
                cancelAction={cancelBooking.bind(null, slug, publicToken)}
                sheetTitle={sheetTitle}
                sheetBody={sheetBody}
                callText={callText}
                policyText={policyText}
              />
              {final && !justSent ? (
                <ButtonLink href={bookAgainHref} variant="ink">
                  Book another time
                </ButtonLink>
              ) : null}
            </section>

            <p className="text-[14px] text-muted">
              Questions about this booking? {capitalize(callTheDesk(f))}.
            </p>
          </div>
        </div>
      </main>
      <FacilityFooter facility={f} />
    </>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-3">
      <dt className="w-16 shrink-0 text-white/55">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-white">{children}</dd>
    </div>
  );
}
