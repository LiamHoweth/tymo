import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

/**
 * Pinned Stripe API version: the one the installed SDK (stripe@23.2.0) was
 * generated against, so request and response shapes match its types.
 * Bump it together with the package.
 */
export const STRIPE_API_VERSION = "2026-11-18.endive" as const satisfies typeof Stripe.API_VERSION;

const globalForStripe = globalThis as unknown as { __tymoStripe?: Stripe };

/** Shared Stripe client (one per process; survives dev hot reloads). */
export function getStripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set; Stripe payments are unavailable.");
  }
  globalForStripe.__tymoStripe ??= new Stripe(env.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Tymo" },
  });
  return globalForStripe.__tymoStripe;
}
