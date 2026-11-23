/** Tymo's application fee in cents: amount × bps / 10,000, rounded half up. */
export function applicationFeeCents(amountCents: number, feeBps: number): number {
  return Math.floor((amountCents * feeBps + 5_000) / 10_000);
}

/** Tymo fee to return on a (partial) refund, in proportion to the amount refunded. */
export function applicationFeeRefundCents(refundCents: number, amountCents: number, feeCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.floor((refundCents * feeCents * 2 + amountCents) / (2 * amountCents));
}

/** Stripe's standard US card fee, for owner-facing estimates only (2.9% + 30¢). */
export function estimatedStripeFeeCents(amountCents: number): number {
  return Math.floor((amountCents * 290 + 5_000) / 10_000) + 30;
}
