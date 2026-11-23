import "server-only";
import { env } from "@/lib/env";
import { fakePaymentProvider } from "./fake";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";
export { applicationFeeCents, applicationFeeRefundCents, estimatedStripeFeeCents } from "./fees";

let override: PaymentProvider | null = null;

/** The active provider: Stripe when PAYMENTS_MODE=stripe (or a secret key is set), else the fake. */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (override) return override;
  if (env.paymentsMode === "stripe") {
    const { stripePaymentProvider } = await import("./stripe");
    return stripePaymentProvider;
  }
  return fakePaymentProvider;
}

/** Tests only. */
export function setPaymentProviderForTests(provider: PaymentProvider | null) {
  override = provider;
}
