"use client";

import { useStripe } from "@stripe/react-stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Notice, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SendResult } from "./action-types";
import { useCheckout } from "./CheckoutProvider";
import { CARD_DECLINED_COPY, SEND_DROPPED_COPY, type SubmitErrorCode } from "./copy";
import type { CheckoutSummary } from "./DetailsForm";
import { HoldTimer } from "./HoldTimer";
import { StepFrame } from "./StepChrome";
import { SummaryBar, barButtonClass } from "./SummaryBar";

type Failure = { code: SubmitErrorCode | "dropped"; message: string; href?: string };

interface Props {
  sendAction: (input: { fakeCardNumber?: string }) => Promise<SendResult>;
  leaveAction: () => Promise<void>;
  whenLine: string;
  priceLine: string;
  personLine: string;
  contactLine: string;
  cancellationBox: string;
  responseBox: string;
  detailsHref: string;
  paymentHref: string;
  summary: CheckoutSummary;
  /** Stripe sent the renter back from an authentication page with the card already held. */
  alreadyConfirmed: boolean;
}

/** Step 5 of 5: everything they're agreeing to, the policy boxes, and Send request. */
export function ReviewStep(props: Props) {
  const { mode, stripeReady } = useCheckout();
  // useStripe() needs the Elements provider, which only exists in Stripe mode.
  return mode === "stripe" && stripeReady ? <StripeReview {...props} /> : <Review {...props} stripe={null} />;
}

function StripeReview(props: Props) {
  const stripe = useStripe();
  return <Review {...props} stripe={stripe} />;
}

function Review({
  sendAction,
  leaveAction,
  whenLine,
  priceLine,
  personLine,
  contactLine,
  cancellationBox,
  responseBox,
  detailsHref,
  paymentHref,
  summary,
  alreadyConfirmed,
  stripe,
}: Props & { stripe: ReturnType<typeof useStripe> }) {
  const { card, setCard, mode, markSent } = useCheckout();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirmed, setConfirmed] = useState(alreadyConfirmed);
  const confirmedRef = useRef(alreadyConfirmed);
  const inFlight = useRef(false);
  const failureRef = useRef<HTMLDivElement>(null);
  const needsCard = !card && !(mode === "stripe" && confirmed);

  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [failure]);

  const stop = () => {
    inFlight.current = false;
    setSending(false);
  };

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setFailure(null);

    // Stripe: place the hold now (Send request), unless it already succeeded.
    if (mode === "stripe" && !confirmedRef.current) {
      if (!stripe || card?.kind !== "stripe") {
        stop();
        return;
      }
      try {
        const { error, paymentIntent } = await stripe.confirmPayment({
          clientSecret: card.clientSecret,
          confirmParams: {
            confirmation_token: card.confirmationTokenId,
            return_url: `${window.location.origin}${window.location.pathname}`,
          },
          redirect: "if_required",
        });
        if (error) {
          const declined = error.type === "card_error" || error.type === "validation_error";
          setCard(null);
          setFailure({
            code: declined ? "card_declined" : "payment_error",
            message:
              error.code === "card_declined" || !error.message
                ? CARD_DECLINED_COPY
                : `${error.message.replace(/\.?$/, ".")} You haven't been charged.`,
          });
          stop();
          return;
        }
        if (paymentIntent?.status !== "requires_capture") {
          setCard(null);
          setFailure({ code: "card_not_confirmed", message: "We couldn't confirm your card. You haven't been charged. Add your card again." });
          stop();
          return;
        }
        confirmedRef.current = true;
        setConfirmed(true);
      } catch {
        setFailure({ code: "dropped", message: SEND_DROPPED_COPY });
        stop();
        return;
      }
    }

    let result: SendResult;
    try {
      result = await sendAction({ fakeCardNumber: card?.kind === "fake" ? card.number : undefined });
    } catch {
      setFailure({ code: "dropped", message: SEND_DROPPED_COPY });
      stop();
      return;
    }

    if (result.ok) {
      markSent();
      router.replace(result.href);
      return; // keep "Sending..." until the page changes
    }
    if (result.error === "already_submitted") markSent();
    if (result.error === "card_declined" || result.error === "card_not_confirmed") setCard(null);
    setFailure({ code: result.error, message: result.message, href: result.href });
    stop();
  }

  const failureActions: ReactNode = (() => {
    if (!failure) return null;
    switch (failure.code) {
      case "card_declined":
      case "card_not_confirmed":
        return (
          <Link href={paymentHref} className={buttonClass({ variant: "ink", size: "md" })}>
            Use another card
          </Link>
        );
      case "hold_expired":
        return (
          <form action={leaveAction}>
            <button type="submit" className={buttonClass({ variant: "ink", size: "md" })}>
              Pick another time
            </button>
          </form>
        );
      case "already_submitted":
        return failure.href ? (
          <Link href={failure.href} className={buttonClass({ variant: "ink", size: "md" })}>
            View your request
          </Link>
        ) : null;
      case "invalid":
        return (
          <Link href={detailsHref} className={buttonClass({ variant: "ink", size: "md" })}>
            Check your details
          </Link>
        );
      default:
        return null;
    }
  })();

  const blocked = failure?.code === "hold_expired" || failure?.code === "already_submitted";
  const buttonLabel = sending ? "Sending..." : failure?.code === "dropped" ? "Check again" : "Send request";

  return (
    <StepFrame
      aside={
        <SummaryBar
          title={summary.title}
          when={summary.when}
          price={summary.price}
          priceNote="Charged only when the front desk confirms."
          footer={blocked ? null : <HoldTimer expiresAt={summary.expiresAt} />}
          action={
            <button
              type="button"
              onClick={send}
              disabled={blocked || (needsCard && !sending)}
              aria-disabled={sending || undefined}
              className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}
            >
              {buttonLabel}
            </button>
          }
        />
      }
    >
      <div className="max-w-2xl space-y-6">
        {failure ? (
          <div ref={failureRef}>
            <Notice tone={failure.code === "dropped" ? "warn" : "danger"} live="assertive" actions={failureActions}>
              {failure.message}
            </Notice>
          </div>
        ) : null}

        <dl className="divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-white">
          <ReviewLine label="Field and time" edit={<EditButton action={leaveAction} label="Edit field and time" />}>
            <p className="font-semibold text-text">{whenLine}</p>
            <p className="mt-1 text-muted">{priceLine}</p>
          </ReviewLine>
          <ReviewLine label="You" edit={<EditLink href={detailsHref} label="Edit your details" />}>
            <p className="font-semibold text-text">{personLine}</p>
            <p className="mt-1 break-words text-muted">{contactLine}</p>
          </ReviewLine>
          <ReviewLine label="Card" edit={<EditLink href={paymentHref} label="Edit card" />}>
            {card ? (
              <p className="font-semibold text-text">{card.label}</p>
            ) : mode === "stripe" && confirmed ? (
              <p className="font-semibold text-text">Card held</p>
            ) : (
              <p className="text-muted">No card added yet</p>
            )}
            <p className="mt-1 text-muted">Held when you send, charged only if they confirm.</p>
          </ReviewLine>
        </dl>

        {needsCard && !failure ? (
          <Notice
            tone="warn"
            title="Add your card again"
            actions={
              <Link href={paymentHref} className={buttonClass({ variant: "ink", size: "md" })}>
                Add card
              </Link>
            }
          >
            Card details aren&apos;t kept when the page reloads. You haven&apos;t been charged.
          </Notice>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Notice title="Cancellation">{cancellationBox}</Notice>
          <Notice title="Response time">{responseBox}</Notice>
        </div>
      </div>
    </StepFrame>
  );
}

function ReviewLine({ label, edit, children }: { label: string; edit: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1 text-[15px] leading-snug">
        <dt className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted">{label}</dt>
        <dd>{children}</dd>
      </div>
      {edit}
    </div>
  );
}

const editClass = cn(
  "-my-1 inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-brand",
  "underline underline-offset-4 hover:bg-paper",
);

function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={editClass} aria-label={label}>
      Edit
    </Link>
  );
}

function EditButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <button type="submit" className={editClass} aria-label={label}>
        Edit
      </button>
    </form>
  );
}
