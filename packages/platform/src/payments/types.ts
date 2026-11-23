/**
 * Payment provider contract. v1 uses Stripe Connect direct charges on the
 * facility's own account with capture_method=manual (hold at request,
 * capture on approval) and Tymo's fee as application_fee_amount.
 * Every mutating call takes an idempotency key derived from the booking.
 */

export type HoldStatus =
  | "requires_payment_method" // created, customer hasn't entered a card
  | "requires_action" // 3DS or similar in progress
  | "authorized" // held, ready to capture
  | "captured"
  | "canceled"
  | "failed";

export interface CreateHoldArgs {
  stripeAccountId: string | null;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
  description: string; // "N1A · Sat Dec 5, 10:00–11:30 AM CT"
  statementDescriptorSuffix?: string;
  receiptEmail?: string;
  metadata: Record<string, string>; // tenant_id, booking_id
  idempotencyKey: string;
}

export interface HoldInfo {
  status: HoldStatus;
  amountCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
  /** When the issuer's authorization expires (Stripe capture_before). */
  captureBefore: string | null;
  declineMessage: string | null;
}

export type CaptureResult = { ok: true; amountCapturedCents: number } | { ok: false; reason: string };
export type RefundResult = { ok: true; refundId: string; amountRefundedCents: number } | { ok: false; reason: string };

export interface ConnectedAccountStatus {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
}

export interface PaymentProvider {
  readonly mode: "stripe" | "fake";

  /** Create a manual-capture payment. Stripe returns a client secret for the Payment Element. */
  createHold(args: CreateHoldArgs): Promise<{ paymentIntentId: string; clientSecret: string | null }>;

  /** Current state of a payment (used at Send request to verify the card was authorized). */
  getHold(args: { stripeAccountId: string | null; paymentIntentId: string }): Promise<HoldInfo>;

  /**
   * Fake mode only: simulate the customer confirming the card in the browser.
   * Card 4000 0000 0000 0002 declines; anything else with 12+ digits succeeds.
   */
  simulateConfirm?(args: { paymentIntentId: string; cardNumber: string }): Promise<HoldInfo>;

  capture(args: { stripeAccountId: string | null; paymentIntentId: string; idempotencyKey: string }): Promise<CaptureResult>;

  /** Release a hold (decline, expiry, abandoned checkout). Safe to call twice. */
  cancel(args: { stripeAccountId: string | null; paymentIntentId: string; idempotencyKey: string }): Promise<void>;

  refund(args: {
    stripeAccountId: string | null;
    paymentIntentId: string;
    amountCents: number;
    refundApplicationFee: boolean;
    idempotencyKey: string;
  }): Promise<RefundResult>;

  /** Connect onboarding (owner, from Settings / first-run). */
  createConnectedAccount(args: {
    tenantId: string;
    legalName: string;
    email: string | null;
    websiteUrl: string;
    statementDescriptor: string | null;
  }): Promise<{ stripeAccountId: string }>;
  createOnboardingLink(args: { stripeAccountId: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  getAccountStatus(args: { stripeAccountId: string }): Promise<ConnectedAccountStatus>;
}
