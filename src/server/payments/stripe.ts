import "server-only";
import type { PaymentProvider } from "./types";
import { notImplemented } from "@/server/not-implemented";

/**
 * Stripe Connect implementation (owned by the payments module).
 * Direct charges on the connected account (Stripe-Account header),
 * capture_method=manual, application_fee_amount = Tymo's fee.
 */
export const stripePaymentProvider: PaymentProvider = {
  mode: "stripe",
  createHold: (args) => notImplemented("stripe.createHold", args),
  getHold: (args) => notImplemented("stripe.getHold", args),
  capture: (args) => notImplemented("stripe.capture", args),
  cancel: (args) => notImplemented("stripe.cancel", args),
  refund: (args) => notImplemented("stripe.refund", args),
  createConnectedAccount: (args) => notImplemented("stripe.createConnectedAccount", args),
  createOnboardingLink: (args) => notImplemented("stripe.createOnboardingLink", args),
  getAccountStatus: (args) => notImplemented("stripe.getAccountStatus", args),
};
