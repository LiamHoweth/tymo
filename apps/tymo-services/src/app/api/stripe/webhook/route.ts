import type Stripe from "stripe";
import { env } from "@tymo/shared/env";
import { processStripeEvent, verifyStripeWebhook } from "@tymo/platform/payments/webhook";

/**
 * Stripe webhook endpoint (Connect events included). Verifies the
 * signature over the raw body, de-dupes by event id in stripe_events, and
 * applies account.updated to the facility's payout flags.
 */
export async function POST(request: Request): Promise<Response> {
  if (!env.stripeWebhookSecret) {
    return Response.json({ error: "Webhook secret not configured" }, { status: 503 });
  }
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] rejected webhook:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const { duplicate } = await processStripeEvent(event);
    return Response.json({ received: true, duplicate });
  } catch (err) {
    // 500 makes Stripe retry; the event record rolled back with the failure.
    console.error(`[stripe] could not process ${event.type} ${event.id}`, err);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
