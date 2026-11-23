import type { CaptureResult, HoldInfo, PaymentProvider, RefundResult } from "./types";

/**
 * In-process fake for local dev and tests. State lives on globalThis so it
 * survives Next.js hot reloads. Unknown payment ids (e.g. after a server
 * restart) are treated as authorized Visa 4242 holds so dev data keeps
 * working; tests should not rely on that.
 */
interface FakeIntent {
  id: string;
  amountCents: number;
  status: HoldInfo["status"];
  cardBrand: string | null;
  cardLast4: string | null;
  captureBefore: string | null;
  declineMessage: string | null;
  refundedCents: number;
}

const store: Map<string, FakeIntent> = ((globalThis as Record<string, unknown>).__tymoFakePayments ??= new Map()) as Map<
  string,
  FakeIntent
>;
const idem: Map<string, unknown> = ((globalThis as Record<string, unknown>).__tymoFakeIdem ??= new Map()) as Map<
  string,
  unknown
>;

let counter = 0;
const newId = (prefix: string) => `${prefix}_fake_${Date.now().toString(36)}${(counter++).toString(36)}`;

function get(id: string): FakeIntent {
  let intent = store.get(id);
  if (!intent) {
    intent = {
      id,
      amountCents: 0,
      status: "authorized",
      cardBrand: "visa",
      cardLast4: "4242",
      captureBefore: null,
      declineMessage: null,
      refundedCents: 0,
    };
    store.set(id, intent);
  }
  return intent;
}

const info = (i: FakeIntent): HoldInfo => ({
  status: i.status,
  amountCents: i.amountCents,
  cardBrand: i.cardBrand,
  cardLast4: i.cardLast4,
  captureBefore: i.captureBefore,
  declineMessage: i.declineMessage,
});

function once<T>(key: string, fn: () => T): T {
  if (idem.has(key)) return idem.get(key) as T;
  const result = fn();
  idem.set(key, result);
  return result;
}

export const fakePaymentProvider: PaymentProvider = {
  mode: "fake",

  async createHold(args) {
    return once(`create:${args.idempotencyKey}`, () => {
      const id = newId("pi");
      store.set(id, {
        id,
        amountCents: args.amountCents,
        status: "requires_payment_method",
        cardBrand: null,
        cardLast4: null,
        captureBefore: null,
        declineMessage: null,
        refundedCents: 0,
      });
      return { paymentIntentId: id, clientSecret: null };
    });
  },

  async getHold({ paymentIntentId }) {
    return info(get(paymentIntentId));
  },

  async simulateConfirm({ paymentIntentId, cardNumber }) {
    const intent = get(paymentIntentId);
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 12) {
      intent.status = "requires_payment_method";
      intent.declineMessage = "Your card number is incomplete.";
    } else if (digits === "4000000000000002") {
      intent.status = "requires_payment_method";
      intent.declineMessage = "Your card was declined.";
    } else {
      intent.status = "authorized";
      intent.declineMessage = null;
      intent.cardBrand = digits.startsWith("4") ? "visa" : digits.startsWith("5") ? "mastercard" : "card";
      intent.cardLast4 = digits.slice(-4);
      intent.captureBefore = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    }
    return info(intent);
  },

  async capture({ paymentIntentId, idempotencyKey }): Promise<CaptureResult> {
    return once(`capture:${idempotencyKey}`, () => {
      const intent = get(paymentIntentId);
      if (intent.status === "captured") return { ok: true as const, amountCapturedCents: intent.amountCents };
      if (intent.status !== "authorized") return { ok: false as const, reason: `cannot capture a ${intent.status} payment` };
      intent.status = "captured";
      return { ok: true as const, amountCapturedCents: intent.amountCents };
    });
  },

  async cancel({ paymentIntentId }) {
    const intent = get(paymentIntentId);
    if (intent.status !== "captured") intent.status = "canceled";
  },

  async refund({ paymentIntentId, amountCents, idempotencyKey }): Promise<RefundResult> {
    return once(`refund:${idempotencyKey}`, () => {
      const intent = get(paymentIntentId);
      if (intent.status !== "captured") return { ok: false as const, reason: "payment was not captured" };
      const remaining = intent.amountCents - intent.refundedCents;
      const amount = Math.min(amountCents, remaining > 0 ? remaining : amountCents);
      intent.refundedCents += amount;
      return { ok: true as const, refundId: newId("re"), amountRefundedCents: amount };
    });
  },

  async createConnectedAccount() {
    return { stripeAccountId: newId("acct") };
  },

  async createOnboardingLink({ returnUrl }) {
    // Fake onboarding completes immediately.
    return { url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}fake_onboarding=done` };
  },

  async getAccountStatus() {
    return { chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: true, requirementsDue: [] };
  },
};

/** Test helper: make an authorized hold unusable, like a lapsed or voided authorization. */
export function fakeVoidHold(paymentIntentId: string) {
  get(paymentIntentId).status = "canceled";
}

/** Test helper: wipe fake state between tests. */
export function resetFakePayments() {
  store.clear();
  idem.clear();
}
