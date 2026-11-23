import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { WebhookVerificationError, eventAccountId, verifyStripeWebhook } from "./webhook-verify";

const secret = "whsec_test_secret_for_unit_tests";

const accountUpdated = {
  id: "evt_test_1",
  object: "event",
  type: "account.updated",
  account: "acct_test_facility",
  api_version: "2026-11-18.endive",
  created: 1_795_000_000,
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  data: {
    object: {
      id: "acct_test_facility",
      object: "account",
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: true,
    },
  },
};

function signed(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? secret, timestamp: opts.timestamp });
}

describe("verifyStripeWebhook", () => {
  it("accepts a correctly signed raw body and parses the event", () => {
    const payload = JSON.stringify(accountUpdated);
    const event = verifyStripeWebhook(payload, signed(payload), secret);
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("account.updated");
    expect(eventAccountId(event)).toBe("acct_test_facility");
  });

  it("rejects a signature made with another secret", () => {
    const payload = JSON.stringify(accountUpdated);
    expect(() => verifyStripeWebhook(payload, signed(payload, { secret: "whsec_other" }), secret)).toThrow(
      WebhookVerificationError,
    );
  });

  it("rejects a body changed after signing (including re-serialized JSON)", () => {
    const payload = JSON.stringify(accountUpdated, null, 2);
    const header = signed(payload);
    const tampered = payload.replace('"charges_enabled": true', '"charges_enabled": false');
    expect(() => verifyStripeWebhook(tampered, header, secret)).toThrow(WebhookVerificationError);
    expect(() => verifyStripeWebhook(JSON.stringify(JSON.parse(payload)), header, secret)).toThrow(WebhookVerificationError);
  });

  it("rejects stale timestamps (replay)", () => {
    const payload = JSON.stringify(accountUpdated);
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(() => verifyStripeWebhook(payload, signed(payload, { timestamp: oneHourAgo }), secret)).toThrow(
      WebhookVerificationError,
    );
  });

  it("rejects a missing header or a missing secret", () => {
    const payload = JSON.stringify(accountUpdated);
    expect(() => verifyStripeWebhook(payload, null, secret)).toThrow(/Missing Stripe-Signature/);
    expect(() => verifyStripeWebhook(payload, signed(payload), "")).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("finds the account on platform events without event.account", () => {
    const payload = JSON.stringify({ ...accountUpdated, account: undefined });
    const event = verifyStripeWebhook(payload, signed(payload), secret);
    expect(eventAccountId(event)).toBe("acct_test_facility");
    const other = JSON.stringify({ ...accountUpdated, type: "payment_intent.canceled", account: undefined, data: { object: { id: "pi_1" } } });
    expect(eventAccountId(verifyStripeWebhook(other, signed(other), secret))).toBeNull();
  });
});
