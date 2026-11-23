"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptionsMode } from "@stripe/stripe-js";
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { FacilityPublic } from "@tymo/shared/types";
import { AlreadySent } from "./CheckoutStates";
import { useFacility } from "./FacilityContext";

/**
 * Card state for one checkout, kept in memory only (never stored). The
 * provider lives in the checkout layout, so it survives moving between
 * Your details, Payment and Review, and is gone on reload.
 *
 * Stripe: the Payment step collects the card and creates a ConfirmationToken;
 * Review confirms the PaymentIntent with it when the renter taps Send request,
 * so the hold is placed at Send (spec) and a decline shows right there.
 * Fake mode: the typed test number is passed to submitRequest.
 */
export type CardState =
  | { kind: "fake"; number: string; label: string }
  | { kind: "stripe"; confirmationTokenId: string; clientSecret: string; label: string };

interface CheckoutValue {
  slug: string;
  token: string;
  mode: FacilityPublic["payments"]["mode"];
  /** False when Stripe mode is on but the facility's keys are missing. */
  stripeReady: boolean;
  card: CardState | null;
  setCard: (card: CardState | null) => void;
  /** Remember (per tab) that this checkout was sent, so Back says "already sent". */
  markSent: () => void;
}

const CheckoutContext = createContext<CheckoutValue | null>(null);

const sentKey = (token: string) => `tymo:sent:${token}`;
const noSubscribe = () => () => {};
function readSent(token: string): boolean {
  try {
    return window.sessionStorage.getItem(sentKey(token)) === "1";
  } catch {
    return false;
  }
}

const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(publishableKey: string, stripeAccount: string) {
  const key = `${publishableKey}:${stripeAccount}`;
  let promise = stripeCache.get(key);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount });
    stripeCache.set(key, promise);
  }
  return promise;
}

export function CheckoutProvider({
  slug,
  token,
  payments,
  amountCents,
  brandColor,
  children,
}: {
  slug: string;
  token: string;
  payments: FacilityPublic["payments"];
  amountCents: number | null;
  brandColor: string;
  children: ReactNode;
}) {
  const [card, setCard] = useState<CardState | null>(null);
  const stripeReady = Boolean(
    payments.mode === "stripe" && payments.publishableKey && payments.stripeAccountId && amountCents,
  );
  const stripePromise = useMemo(
    () => (stripeReady ? getStripe(payments.publishableKey!, payments.stripeAccountId!) : null),
    [stripeReady, payments.publishableKey, payments.stripeAccountId],
  );
  const value = useMemo(
    () => ({
      slug,
      token,
      mode: payments.mode,
      stripeReady,
      card,
      setCard,
      markSent: () => {
        try {
          window.sessionStorage.setItem(sentKey(token), "1");
        } catch {
          // Private mode: the server cookie still answers "already sent" on reload.
        }
      },
    }),
    [slug, token, payments.mode, stripeReady, card],
  );

  const content = <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
  if (!stripePromise || !amountCents) return content;

  const options: StripeElementsOptionsMode = {
    mode: "payment",
    amount: amountCents,
    currency: "usd",
    captureMethod: "manual",
    allowedPaymentMethodTypes: ["card"],
    fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" }],
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: brandColor,
        colorText: "#0b1222",
        colorTextSecondary: "#586274",
        colorDanger: "#b4232f",
        colorBackground: "#ffffff",
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSizeBase: "16px",
        borderRadius: "12px",
      },
      rules: {
        ".Input": { border: "1.5px solid #dfe4ec", boxShadow: "none", padding: "13px 14px" },
        ".Input:focus": { borderColor: brandColor, boxShadow: `0 0 0 4px ${brandColor}24` },
        ".Label": { fontWeight: "600", fontSize: "13px", color: "#0b1222" },
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      {content}
    </Elements>
  );
}

export function useCheckout(): CheckoutValue {
  const value = useContext(CheckoutContext);
  if (!value) throw new Error("useCheckout must be used inside CheckoutProvider");
  return value;
}

/**
 * Wraps a checkout step's normal content. If this tab already sent the
 * request (e.g. the renter pressed Back from the booking page, which shows
 * a cached copy of the step), it says "already sent" instead. A fresh load
 * gets the same answer from the server, with a link to the booking.
 */
export function SentGuard({ children }: { children: ReactNode }) {
  const { token } = useCheckout();
  const facility = useFacility();
  const sent = useSyncExternalStore(noSubscribe, () => readSent(token), () => false);
  return sent ? <AlreadySent facility={facility} /> : children;
}
