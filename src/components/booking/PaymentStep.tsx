"use client";

import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Notice, TextField, buttonClass } from "@/components/ui";
import { formatCard } from "@/lib/format";
import { useCheckout } from "./CheckoutProvider";
import { LOAD_FAILED_COPY, holdRanOutCopy } from "./copy";
import type { CheckoutSummary } from "./DetailsForm";
import { HoldTimer } from "./HoldTimer";
import { ArrowRight, Lock } from "./icons";
import { StepFrame } from "./StepChrome";
import { SummaryBar, barButtonClass } from "./SummaryBar";
import { cardDigits, fakeCardLabel, groupCard } from "./validate";

export type PaymentProblem = "hold_expired" | "load_failed" | "not_set_up" | null;

interface Props {
  mode: "stripe" | "fake";
  clientSecret: string | null;
  problem: PaymentProblem;
  problemMessage?: string;
  facilityName: string;
  priceLabel: string;
  summary: CheckoutSummary;
  range: string;
  reviewHref: string;
  billing: { name: string; email: string };
  leaveAction: () => Promise<void>;
  callLine: string;
}

/** Step 4 of 5: the hold explained above the card field, not in fine print. */
export function PaymentStep(props: Props) {
  const { stripeReady } = useCheckout();
  if (props.problem) return <PaymentProblemView {...props} />;
  if (props.mode === "stripe") {
    if (!stripeReady || !props.clientSecret) return <PaymentProblemView {...props} problem="not_set_up" />;
    return <StripeCardForm {...props} clientSecret={props.clientSecret} />;
  }
  return <FakeCardForm {...props} />;
}

function HoldExplainer({ facilityName, priceLabel }: { facilityName: string; priceLabel: string }) {
  return (
    <Notice title={`You won't be charged until ${facilityName} confirms.`}>
      Your bank may show a pending {priceLabel} until they answer. If they say no or don&apos;t answer in time, it
      drops off and you pay nothing.
    </Notice>
  );
}

function Frame({
  summary,
  children,
  busy,
  canContinue = true,
  error,
  onSubmit,
  facilityName,
  priceLabel,
}: {
  summary: CheckoutSummary;
  children: ReactNode;
  busy: boolean;
  canContinue?: boolean;
  error: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  facilityName: string;
  priceLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <StepFrame
        aside={
          <SummaryBar
            title={summary.title}
            when={summary.when}
            price={summary.price}
            priceNote="Held now, charged only when the front desk confirms."
            footer={<HoldTimer expiresAt={summary.expiresAt} />}
            action={
              <button
                type="submit"
                disabled={!canContinue}
                aria-disabled={busy || undefined}
                className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}
              >
                {busy ? "Checking card..." : "Continue"}
                {busy ? null : <ArrowRight className="h-[18px] w-[18px]" />}
              </button>
            }
          />
        }
      >
        <div className="max-w-xl space-y-5">
          <HoldExplainer facilityName={facilityName} priceLabel={priceLabel} />
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          {children}
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <Lock className="h-4 w-4" />
            {facilityName} never sees your full card number.
          </p>
        </div>
      </StepFrame>
    </form>
  );
}

function FakeCardForm({ facilityName, priceLabel, summary, reviewHref }: Props) {
  const { card, setCard } = useCheckout();
  const router = useRouter();
  const [number, setNumber] = useState(card?.kind === "fake" ? groupCard(card.number) : "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const digits = cardDigits(number);
    if (digits.length !== 16) {
      setFieldError("Enter the 16-digit card number.");
      document.getElementById("card-number")?.focus();
      return;
    }
    setBusy(true);
    setCard({ kind: "fake", number: digits, label: fakeCardLabel(digits) });
    router.push(reviewHref);
  };

  return (
    <Frame summary={summary} busy={busy} error={null} onSubmit={onSubmit} facilityName={facilityName} priceLabel={priceLabel}>
      <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <p className="mb-4 inline-flex rounded-full bg-warn-soft px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-warn">
          Test mode
        </p>
        <TextField
          id="card-number"
          name="cardNumber"
          label="Card number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 1234 1234 1234"
          hint="Test mode: any 16 digits work; 4000 0000 0000 0002 declines"
          value={number}
          onChange={(e) => {
            setNumber(groupCard(cardDigits(e.currentTarget.value)));
            setFieldError(null);
          }}
          error={fieldError}
          className="[&_input]:tabular-nums [&_input]:tracking-[0.04em]"
        />
      </div>
    </Frame>
  );
}

function StripeCardForm({
  facilityName,
  priceLabel,
  summary,
  reviewHref,
  billing,
  clientSecret,
}: Props & { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const { setCard } = useCheckout();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: invalid } = await elements.submit();
      if (invalid) {
        // The Payment Element shows the field error inline.
        setBusy(false);
        return;
      }
      const { error: tokenError, confirmationToken } = await stripe.createConfirmationToken({
        elements,
        params: { payment_method_data: { billing_details: { name: billing.name, email: billing.email } } },
      });
      if (tokenError || !confirmationToken) {
        setError(tokenError?.message ?? "We couldn't read that card. Check the details and try again.");
        setBusy(false);
        return;
      }
      const preview = confirmationToken.payment_method_preview.card;
      setCard({
        kind: "stripe",
        confirmationTokenId: confirmationToken.id,
        clientSecret,
        label: (preview && formatCard(preview.brand, preview.last4)) || "Card added",
      });
      router.push(reviewHref);
    } catch {
      setError("Couldn't reach the card processor. Check your signal and try again.");
      setBusy(false);
    }
  };

  return (
    <Frame
      summary={summary}
      busy={busy}
      canContinue={ready && !loadFailed}
      error={error}
      onSubmit={onSubmit}
      facilityName={facilityName}
      priceLabel={priceLabel}
    >
      <div className="relative min-h-[180px] rounded-2xl border border-line bg-white p-4 sm:p-5">
        {loadFailed ? (
          <Notice
            tone="danger"
            live="assertive"
            actions={
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => window.location.reload()}>
                Try again
              </Button>
            }
          >
            {LOAD_FAILED_COPY}
          </Notice>
        ) : (
          <>
            {ready ? null : (
              <div aria-hidden className="absolute inset-4 space-y-3 sm:inset-5">
                <div className="h-4 w-28 animate-pulse rounded-full bg-line" />
                <div className="h-12 animate-pulse rounded-xl bg-[#e6eaf1]" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-12 animate-pulse rounded-xl bg-[#e6eaf1]" />
                  <div className="h-12 animate-pulse rounded-xl bg-[#e6eaf1]" />
                </div>
              </div>
            )}
            <PaymentElement
              onReady={() => setReady(true)}
              onLoadError={() => setLoadFailed(true)}
              options={{
                layout: "tabs",
                wallets: { applePay: "never", googlePay: "never" },
                fields: { billingDetails: { name: "never", email: "never" } },
              }}
            />
          </>
        )}
      </div>
    </Frame>
  );
}

function PaymentProblemView({ problem, problemMessage, facilityName, priceLabel, summary, range, leaveAction, callLine }: Props) {
  const router = useRouter();
  const content =
    problem === "hold_expired" ? (
      <Notice
        tone="danger"
        live="assertive"
        title="Your hold ran out"
        actions={
          <form action={leaveAction}>
            <button type="submit" className={buttonClass({ variant: "accent", size: "md" })}>
              Pick another time
            </button>
          </form>
        }
      >
        {holdRanOutCopy(range)}
      </Notice>
    ) : problem === "not_set_up" ? (
      <Notice tone="warn" live="polite" title={`Card payments aren't set up for ${facilityName} yet.`}>
        {callLine}
      </Notice>
    ) : (
      <Notice
        tone="danger"
        live="assertive"
        actions={
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => router.refresh()}>
            Try again
          </Button>
        }
      >
        {problemMessage ?? LOAD_FAILED_COPY}
      </Notice>
    );

  return (
    <StepFrame
      aside={
        <SummaryBar
          title={summary.title}
          when={summary.when}
          price={summary.price}
          footer={problem === "hold_expired" ? null : <HoldTimer expiresAt={summary.expiresAt} />}
          action={
            <button type="button" disabled className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}>
              Continue
            </button>
          }
        />
      }
    >
      <div className="max-w-xl space-y-5">
        <HoldExplainer facilityName={facilityName} priceLabel={priceLabel} />
        {content}
      </div>
    </StepFrame>
  );
}
