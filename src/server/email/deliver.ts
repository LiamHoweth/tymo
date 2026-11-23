/**
 * Delivery through Resend's HTTP API (no SDK). Pure except for fetch, which
 * tests can replace.
 */

export interface OutgoingEmail {
  fromName: string;
  fromAddress: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  /** Resend de-dupes retries with the same key (we use the outbox row id). */
  idempotencyKey: string;
}

/** `"Redbud Soccer Complex" <bookings@booktymo.com>`; strips characters that would break the header. */
export function formatFrom(name: string, address: string): string {
  const clean = name.replace(/["<>\r\n\\]/g, "").trim() || "Tymo";
  return `"${clean}" <${address}>`;
}

export async function sendViaResend(
  apiKey: string,
  email: OutgoingEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string }> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: formatFrom(email.fromName, email.fromAddress),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (!res.ok || !body?.id) {
    throw new Error(`Resend ${res.status}: ${body?.message || body?.name || res.statusText || "unknown error"}`);
  }
  return { id: body.id };
}
