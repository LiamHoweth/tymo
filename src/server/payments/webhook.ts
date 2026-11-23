import "server-only";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { withSystem } from "@/server/db";
import { stripeEvents, tenants } from "@/server/db/schema";
import { accountStatusFromV1 } from "./stripe";
import { eventAccountId } from "./webhook-verify";

export { verifyStripeWebhook, WebhookVerificationError } from "./webhook-verify";

/**
 * Record the event once (stripe_events de-dupes by event id) and apply it.
 * Runs in one transaction: if applying fails, the record rolls back and
 * Stripe's retry processes it again. Returns duplicate: true when this
 * event id was already processed.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
  const accountId = eventAccountId(event);
  return withSystem(async (tx) => {
    await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type, accountId })
      .onConflictDoNothing({ target: stripeEvents.id });
    // Claim it: only one delivery gets to mark it processed.
    const claimed = await tx
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(and(eq(stripeEvents.id, event.id), isNull(stripeEvents.processedAt)))
      .returning({ id: stripeEvents.id });
    if (claimed.length === 0) return { duplicate: true };

    if (event.type === "account.updated") {
      const account = event.data.object;
      const status = accountStatusFromV1(account);
      await tx
        .update(tenants)
        .set({ stripeChargesEnabled: status.chargesEnabled, stripeDetailsSubmitted: status.detailsSubmitted })
        .where(eq(tenants.stripeAccountId, account.id));
    }
    // Other event types are recorded only; the booking engine reads payment
    // state from Stripe itself when it acts.
    return { duplicate: false };
  });
}
