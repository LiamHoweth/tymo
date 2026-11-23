import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createStripePaymentProvider, cleanDescriptor, mapIntentStatus } = await import("./stripe");
const { STRIPE_API_VERSION } = await import("./stripe-client");

const ACCT = "acct_test_facility";

function makeClient() {
  return {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn(), capture: vi.fn(), cancel: vi.fn() },
    refunds: { create: vi.fn() },
    accounts: { retrieve: vi.fn() },
    v2: { core: { accounts: { create: vi.fn() }, accountLinks: { create: vi.fn() } } },
  };
}

let client: ReturnType<typeof makeClient>;
let provider: ReturnType<typeof createStripePaymentProvider>;

beforeEach(() => {
  client = makeClient();
  provider = createStripePaymentProvider(() => client as unknown as Stripe);
});

const stripeError = (type: string, code: string, message: string) => Object.assign(new Error(message), { type, code });

describe("createHold", () => {
  it("creates a manual-capture card PaymentIntent on the connected account with Tymo's fee", async () => {
    client.paymentIntents.create.mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret_x" });
    const result = await provider.createHold({
      stripeAccountId: ACCT,
      amountCents: 12000,
      currency: "usd",
      applicationFeeCents: 240,
      description: "Indoor Field · Sat Dec 5, 5:00–6:30 PM CT",
      statementDescriptorSuffix: "REDBUD SOCCER * FIELDS 2026",
      receiptEmail: "jamie@example.com",
      metadata: { tenant_id: "t1", booking_id: "b1" },
      idempotencyKey: "hold-b1",
    });
    expect(result).toEqual({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret_x" });
    expect(client.paymentIntents.create).toHaveBeenCalledTimes(1);
    const [params, options] = client.paymentIntents.create.mock.calls[0];
    expect(params).toEqual({
      amount: 12000,
      currency: "usd",
      capture_method: "manual",
      allowed_payment_method_types: ["card"],
      application_fee_amount: 240,
      description: "Indoor Field · Sat Dec 5, 5:00–6:30 PM CT",
      statement_descriptor_suffix: "REDBUD SOCCER FIELDS 2",
      receipt_email: "jamie@example.com",
      metadata: { tenant_id: "t1", booking_id: "b1" },
    });
    expect(options).toEqual({ stripeAccount: ACCT, idempotencyKey: "hold-b1" });
  });

  it("omits optional fields and refuses to charge without a connected account", async () => {
    client.paymentIntents.create.mockResolvedValue({ id: "pi_2", client_secret: "s" });
    await provider.createHold({
      stripeAccountId: ACCT,
      amountCents: 4500,
      currency: "usd",
      applicationFeeCents: 90,
      description: "N1A",
      metadata: {},
      idempotencyKey: "k",
    });
    const [params] = client.paymentIntents.create.mock.calls[0];
    expect(params).not.toHaveProperty("statement_descriptor_suffix");
    expect(params).not.toHaveProperty("receipt_email");
    await expect(
      provider.createHold({ stripeAccountId: null, amountCents: 1, currency: "usd", applicationFeeCents: 0, description: "x", metadata: {}, idempotencyKey: "k2" }),
    ).rejects.toThrow(/connected Stripe account/);
  });
});

describe("getHold", () => {
  it("expands latest_charge and maps an authorized hold", async () => {
    client.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_capture",
      amount: 12000,
      last_payment_error: null,
      latest_charge: {
        id: "ch_1",
        payment_method_details: { card: { brand: "visa", last4: "4242", capture_before: 1_795_500_000 } },
      },
    });
    const info = await provider.getHold({ stripeAccountId: ACCT, paymentIntentId: "pi_1" });
    expect(client.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] }, { stripeAccount: ACCT });
    expect(info).toEqual({
      status: "authorized",
      amountCents: 12000,
      cardBrand: "visa",
      cardLast4: "4242",
      captureBefore: new Date(1_795_500_000 * 1000).toISOString(),
      declineMessage: null,
    });
  });

  it("reports the decline message from last_payment_error", async () => {
    client.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_payment_method",
      amount: 12000,
      last_payment_error: { message: "Your card was declined." },
      latest_charge: null,
    });
    const info = await provider.getHold({ stripeAccountId: ACCT, paymentIntentId: "pi_1" });
    expect(info.status).toBe("requires_payment_method");
    expect(info.declineMessage).toBe("Your card was declined.");
    expect(info.cardLast4).toBeNull();
  });

  it("maps every PaymentIntent status", () => {
    expect(mapIntentStatus("requires_payment_method")).toBe("requires_payment_method");
    expect(mapIntentStatus("requires_confirmation")).toBe("requires_payment_method");
    expect(mapIntentStatus("requires_action")).toBe("requires_action");
    expect(mapIntentStatus("processing")).toBe("requires_action");
    expect(mapIntentStatus("requires_capture")).toBe("authorized");
    expect(mapIntentStatus("succeeded")).toBe("captured");
    expect(mapIntentStatus("canceled")).toBe("canceled");
    expect(mapIntentStatus("something_new")).toBe("failed");
  });
});

describe("capture", () => {
  it("captures on the connected account with the idempotency key", async () => {
    client.paymentIntents.capture.mockResolvedValue({ id: "pi_1", status: "succeeded", amount_received: 12000 });
    const result = await provider.capture({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "capture-b1" });
    expect(result).toEqual({ ok: true, amountCapturedCents: 12000 });
    expect(client.paymentIntents.capture).toHaveBeenCalledWith("pi_1", {}, { stripeAccount: ACCT, idempotencyKey: "capture-b1" });
  });

  it("returns ok:false when the hold lapsed (Stripe says no)", async () => {
    client.paymentIntents.capture.mockRejectedValue(
      stripeError("StripeInvalidRequestError", "payment_intent_unexpected_state", "This PaymentIntent has a status of canceled."),
    );
    client.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "canceled", amount_received: 0 });
    const result = await provider.capture({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "k" });
    expect(result).toEqual({ ok: false, reason: "This PaymentIntent has a status of canceled." });
  });

  it("treats an earlier capture as success", async () => {
    client.paymentIntents.capture.mockRejectedValue(
      stripeError("StripeInvalidRequestError", "payment_intent_unexpected_state", "already succeeded"),
    );
    client.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "succeeded", amount_received: 12000 });
    expect(await provider.capture({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "k" })).toEqual({
      ok: true,
      amountCapturedCents: 12000,
    });
  });

  it("rethrows network errors so the caller can retry instead of failing the booking", async () => {
    client.paymentIntents.capture.mockRejectedValue(stripeError("StripeConnectionError", "", "socket hang up"));
    await expect(provider.capture({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "k" })).rejects.toThrow(
      "socket hang up",
    );
  });
});

describe("cancel", () => {
  it("cancels on the connected account", async () => {
    client.paymentIntents.cancel.mockResolvedValue({ id: "pi_1", status: "canceled" });
    await provider.cancel({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "cancel-b1" });
    expect(client.paymentIntents.cancel).toHaveBeenCalledWith("pi_1", {}, { stripeAccount: ACCT, idempotencyKey: "cancel-b1" });
  });

  it("ignores an already-canceled payment", async () => {
    client.paymentIntents.cancel.mockRejectedValue(
      stripeError("StripeInvalidRequestError", "payment_intent_unexpected_state", "status of canceled"),
    );
    client.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "canceled" });
    await expect(provider.cancel({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "k" })).resolves.toBeUndefined();
  });

  it("does not hide other failures", async () => {
    client.paymentIntents.cancel.mockRejectedValue(
      stripeError("StripeInvalidRequestError", "payment_intent_unexpected_state", "status of succeeded"),
    );
    client.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "succeeded" });
    await expect(provider.cancel({ stripeAccountId: ACCT, paymentIntentId: "pi_1", idempotencyKey: "k" })).rejects.toThrow();
  });
});

describe("refund", () => {
  it("refunds from the facility's balance and returns Tymo's fee in proportion", async () => {
    client.refunds.create.mockResolvedValue({ id: "re_1", amount: 6000, status: "succeeded" });
    const result = await provider.refund({
      stripeAccountId: ACCT,
      paymentIntentId: "pi_1",
      amountCents: 6000,
      refundApplicationFee: true,
      idempotencyKey: "refund-b1-1",
    });
    expect(result).toEqual({ ok: true, refundId: "re_1", amountRefundedCents: 6000 });
    expect(client.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 6000, refund_application_fee: true },
      { stripeAccount: ACCT, idempotencyKey: "refund-b1-1" },
    );
  });

  it("returns ok:false when Stripe refuses", async () => {
    client.refunds.create.mockRejectedValue(stripeError("StripeInvalidRequestError", "charge_already_refunded", "Already refunded."));
    expect(
      await provider.refund({ stripeAccountId: ACCT, paymentIntentId: "pi_1", amountCents: 1, refundApplicationFee: true, idempotencyKey: "k" }),
    ).toEqual({ ok: false, reason: "Already refunded." });
  });
});

describe("Connect", () => {
  it("creates an Accounts v2 account: full Dashboard, facility pays fees, Stripe carries losses", async () => {
    client.v2.core.accounts.create.mockResolvedValue({ id: "acct_new" });
    const result = await provider.createConnectedAccount({
      tenantId: "t1",
      legalName: "Redbud Soccer Complex Inc",
      email: "owner@redbud.example",
      websiteUrl: "https://app.test/book/redbud",
      statementDescriptor: "REDBUD SOCCER",
    });
    expect(result).toEqual({ stripeAccountId: "acct_new" });
    const [params, options] = client.v2.core.accounts.create.mock.calls[0];
    expect(params.dashboard).toBe("full");
    expect(params.defaults.responsibilities).toEqual({ fees_collector: "stripe", losses_collector: "stripe" });
    expect(params.configuration.merchant.capabilities).toEqual({ card_payments: { requested: true } });
    expect(params.configuration.merchant.statement_descriptor).toEqual({ descriptor: "REDBUD SOCCER" });
    expect(params.identity).toEqual({ country: "us", business_details: { registered_name: "Redbud Soccer Complex Inc" } });
    expect(params.defaults.profile.business_url).toBe("https://app.test/book/redbud");
    expect(params.contact_email).toBe("owner@redbud.example");
    expect(params.metadata).toEqual({ tenant_id: "t1" });
    expect(options).toEqual({ idempotencyKey: "connect-account-t1" });
  });

  it("creates a v2 onboarding link", async () => {
    client.v2.core.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.test/setup/x" });
    const result = await provider.createOnboardingLink({
      stripeAccountId: "acct_new",
      refreshUrl: "https://app.test/api/stripe/connect/start",
      returnUrl: "https://app.test/api/stripe/connect/return",
    });
    expect(result).toEqual({ url: "https://connect.stripe.test/setup/x" });
    expect(client.v2.core.accountLinks.create).toHaveBeenCalledWith({
      account: "acct_new",
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: "https://app.test/api/stripe/connect/start",
          return_url: "https://app.test/api/stripe/connect/return",
          collection_options: { fields: "eventually_due" },
        },
      },
    });
  });

  it("maps account status", async () => {
    client.accounts.retrieve.mockResolvedValue({
      id: "acct_new",
      charges_enabled: false,
      details_submitted: true,
      payouts_enabled: false,
      requirements: { currently_due: ["external_account"], past_due: ["external_account", "tos_acceptance.date"] },
    });
    expect(await provider.getAccountStatus({ stripeAccountId: "acct_new" })).toEqual({
      chargesEnabled: false,
      detailsSubmitted: true,
      payoutsEnabled: false,
      requirementsDue: ["external_account", "tos_acceptance.date"],
    });
  });
});

describe("helpers", () => {
  it("cleans statement descriptors to Stripe's rules", () => {
    expect(cleanDescriptor('Redbud "Soccer" <Complex>')).toBe("Redbud Soccer Complex");
    expect(cleanDescriptor("A very long statement descriptor name")).toBe("A very long statement");
    expect(cleanDescriptor("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toHaveLength(22);
    expect(cleanDescriptor("12345")).toBeUndefined();
    expect(cleanDescriptor(null)).toBeUndefined();
  });

  it("pins the API version the SDK was built for", () => {
    expect(STRIPE_API_VERSION).toBe("2026-11-18.endive");
  });
});
