import Stripe from "stripe";

/** Thrown when a webhook request isn't provably from Stripe. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verify a Stripe webhook against the endpoint's signing secret and parse
 * it. Needs the raw request body exactly as received (no JSON round trip).
 * Throws WebhookVerificationError when the secret is missing, the header is
 * missing, or the signature/timestamp doesn't check out.
 */
export function verifyStripeWebhook(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!secret) throw new WebhookVerificationError("STRIPE_WEBHOOK_SECRET is not set.");
  if (!signature) throw new WebhookVerificationError("Missing Stripe-Signature header.");
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new WebhookVerificationError(err instanceof Error ? err.message : "Invalid Stripe signature.");
  }
}

/** The connected account an event is about: Connect events carry `account`; account.updated also has it as the object id. */
export function eventAccountId(event: Stripe.Event): string | null {
  if (event.account) return event.account;
  if (event.type === "account.updated") return event.data.object.id;
  return null;
}
