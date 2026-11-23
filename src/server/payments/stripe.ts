import "server-only";
import type Stripe from "stripe";
import { getStripe } from "./stripe-client";
import type { ConnectedAccountStatus, HoldInfo, HoldStatus, PaymentProvider } from "./types";

/**
 * Stripe Connect implementation of PaymentProvider.
 *
 * Money flow (docs/ARCHITECTURE.md "Payments"): direct charges on the
 * facility's connected account (every call sends the Stripe-Account header
 * via the `stripeAccount` request option), `capture_method: "manual"` so the
 * card is only held until staff approve, and Tymo's cut as
 * `application_fee_amount`. Refunds come out of the facility's balance and
 * return Tymo's fee in proportion (`refund_application_fee: true`).
 *
 * Connected accounts use Accounts v2 (`stripe.v2.core.accounts`), which the
 * installed SDK supports natively: `dashboard: "full"` gives the facility its
 * own full Stripe Dashboard, and `defaults.responsibilities` sets
 * `fees_collector: "stripe"` (the facility pays Stripe's processing fees
 * directly) and `losses_collector: "stripe"` (Stripe, not Tymo, carries
 * negative-balance risk). This is the v2 equivalent of the v1
 * `controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" },
 * losses: { payments: "stripe" } }`. Onboarding uses v2 account links.
 * Accounts v2 accounts are also v1 `acct_` objects, so status reads use
 * `accounts.retrieve` (charges_enabled, details_submitted, payouts_enabled),
 * the same fields the v1 `account.updated` webhook carries.
 */

/** Stripe statement descriptor rules: max 22 chars, no < > \ ' " *. */
export function cleanDescriptor(value: string | null | undefined, max = 22): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[<>\\'"*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  // Stripe requires at least one letter.
  return /[a-z]/i.test(cleaned) ? cleaned : undefined;
}

export function mapIntentStatus(status: Stripe.PaymentIntent.Status): HoldStatus {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
      return "requires_payment_method";
    case "requires_action":
    case "processing":
      return "requires_action";
    case "requires_capture":
      return "authorized";
    case "succeeded":
      return "captured";
    case "canceled":
      return "canceled";
    default:
      return "failed";
  }
}

export function holdInfoFromIntent(intent: Stripe.PaymentIntent): HoldInfo {
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const card = charge?.payment_method_details?.card ?? null;
  const status = mapIntentStatus(intent.status);
  return {
    status,
    amountCents: intent.amount,
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
    captureBefore: card?.capture_before ? new Date(card.capture_before * 1000).toISOString() : null,
    declineMessage: status === "requires_payment_method" ? (intent.last_payment_error?.message ?? null) : null,
  };
}

export function accountStatusFromV1(account: Stripe.Account): ConnectedAccountStatus {
  return {
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
    requirementsDue: [...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])].filter(
      (v, i, all) => all.indexOf(v) === i,
    ),
  };
}

interface StripeErrorLike {
  type?: string;
  code?: string;
  message?: string;
}

function asStripeError(err: unknown): StripeErrorLike | null {
  if (err && typeof err === "object" && "type" in err && typeof (err as StripeErrorLike).type === "string") {
    return err as StripeErrorLike;
  }
  return null;
}

/**
 * A "final" error means Stripe answered and said no (declined, wrong state,
 * bad request): the caller can safely treat the operation as failed.
 * Anything else (network, rate limit, 5xx) is rethrown so the caller can
 * retry with the same idempotency key instead of concluding it failed.
 */
function isFinalError(err: unknown): err is StripeErrorLike {
  const e = asStripeError(err);
  return !!e && (e.type === "StripeCardError" || e.type === "StripeInvalidRequestError");
}

function requireAccount(stripeAccountId: string | null): string {
  if (!stripeAccountId) throw new Error("This facility has no connected Stripe account yet.");
  return stripeAccountId;
}

/** Build the provider around a client getter (tests pass a mocked client). */
export function createStripePaymentProvider(client: () => Stripe): PaymentProvider {
  return {
    mode: "stripe",

    async createHold(args) {
      const stripeAccount = requireAccount(args.stripeAccountId);
      const params: Stripe.PaymentIntentCreateParams = {
        amount: args.amountCents,
        currency: args.currency,
        capture_method: "manual",
        // `payment_method_types` was removed from PaymentIntent create in the
        // 2026-09-30 API; `allowed_payment_method_types` is its replacement.
        allowed_payment_method_types: ["card"],
        application_fee_amount: args.applicationFeeCents,
        description: args.description,
        metadata: args.metadata,
      };
      const suffix = cleanDescriptor(args.statementDescriptorSuffix);
      if (suffix) params.statement_descriptor_suffix = suffix;
      if (args.receiptEmail) params.receipt_email = args.receiptEmail;
      const intent = await client().paymentIntents.create(params, {
        stripeAccount,
        idempotencyKey: args.idempotencyKey,
      });
      return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
    },

    async getHold({ stripeAccountId, paymentIntentId }) {
      const intent = await client().paymentIntents.retrieve(
        paymentIntentId,
        { expand: ["latest_charge"] },
        { stripeAccount: requireAccount(stripeAccountId) },
      );
      return holdInfoFromIntent(intent);
    },

    async capture({ stripeAccountId, paymentIntentId, idempotencyKey }) {
      const stripeAccount = requireAccount(stripeAccountId);
      try {
        const intent = await client().paymentIntents.capture(paymentIntentId, {}, { stripeAccount, idempotencyKey });
        return { ok: true, amountCapturedCents: intent.amount_received };
      } catch (err) {
        if (!isFinalError(err)) throw err;
        // Captured earlier under another key: report the capture, not a failure.
        if (err.code === "payment_intent_unexpected_state") {
          const intent = await client().paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount });
          if (intent.status === "succeeded") return { ok: true, amountCapturedCents: intent.amount_received };
        }
        return { ok: false, reason: err.message || "The card could not be charged." };
      }
    },

    async cancel({ stripeAccountId, paymentIntentId, idempotencyKey }) {
      const stripeAccount = requireAccount(stripeAccountId);
      try {
        await client().paymentIntents.cancel(paymentIntentId, {}, { stripeAccount, idempotencyKey });
      } catch (err) {
        const e = asStripeError(err);
        if (e?.code === "payment_intent_unexpected_state") {
          // Already canceled (or the hold lapsed and Stripe canceled it): nothing to release.
          const intent = await client().paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount });
          if (intent.status === "canceled") return;
        }
        throw err;
      }
    },

    async refund({ stripeAccountId, paymentIntentId, amountCents, refundApplicationFee, idempotencyKey }) {
      const stripeAccount = requireAccount(stripeAccountId);
      try {
        const refund = await client().refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: amountCents,
            refund_application_fee: refundApplicationFee,
          },
          { stripeAccount, idempotencyKey },
        );
        if (refund.status === "failed" || refund.status === "canceled") {
          return { ok: false, reason: refund.failure_reason || "The refund failed." };
        }
        return { ok: true, refundId: refund.id, amountRefundedCents: refund.amount };
      } catch (err) {
        if (!isFinalError(err)) throw err;
        return { ok: false, reason: err.message || "The refund failed." };
      }
    },

    async createConnectedAccount({ tenantId, legalName, email, websiteUrl, statementDescriptor }) {
      const descriptor = cleanDescriptor(statementDescriptor) ?? cleanDescriptor(legalName);
      const account = await client().v2.core.accounts.create(
        {
          display_name: legalName,
          ...(email ? { contact_email: email } : {}),
          dashboard: "full",
          identity: {
            country: "us",
            business_details: { registered_name: legalName },
          },
          defaults: {
            currency: "usd",
            locales: ["en-US"],
            profile: {
              business_url: websiteUrl,
              product_description: "Sports field and facility rentals, booked and paid online.",
            },
            responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
          },
          configuration: {
            merchant: {
              capabilities: { card_payments: { requested: true } },
              ...(descriptor ? { statement_descriptor: { descriptor } } : {}),
            },
          },
          metadata: { tenant_id: tenantId },
        },
        { idempotencyKey: `connect-account-${tenantId}` },
      );
      return { stripeAccountId: account.id };
    },

    async createOnboardingLink({ stripeAccountId, refreshUrl, returnUrl }) {
      const link = await client().v2.core.accountLinks.create({
        account: stripeAccountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            refresh_url: refreshUrl,
            return_url: returnUrl,
            collection_options: { fields: "eventually_due" },
          },
        },
      });
      return { url: link.url };
    },

    async getAccountStatus({ stripeAccountId }) {
      const account = await client().accounts.retrieve(stripeAccountId);
      return accountStatusFromV1(account);
    },
  };
}

export const stripePaymentProvider: PaymentProvider = createStripePaymentProvider(getStripe);
