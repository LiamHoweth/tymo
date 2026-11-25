/**
 * Emails each new request from the Tymo website's quote form to the inboxes
 * in TYMO_QUOTE_NOTIFY_TO, through Resend's HTTP API (RESEND_API_KEY).
 * Replies go straight to the person who sent the request.
 *
 * Addresses come from the environment only: this repository is public.
 */

const centralTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const validAddress = (value) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value);

/** "Tue, Nov 24 · 8:05 PM CT" */
export function formatReceived(at) {
  const parts = Object.fromEntries(centralTime.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${parts.month} ${parts.day} · ${parts.hour}:${parts.minute} ${parts.dayPeriod} CT`;
}

/** `"Tymo requests" <requests@booktymo.com>` from EMAIL_FROM, which may be a bare address or already named. */
function fromHeader(emailFrom) {
  const value = (emailFrom || "requests@booktymo.com").replace(/[\r\n]/g, "").trim();
  return value.includes("<") ? value : `"Tymo requests" <${value}>`;
}

/** One clean summary of a website request: subject, HTML and plain text. */
export function renderQuoteEmail(quote, { receivedAt = new Date(), adminUrl = null } = {}) {
  const received = formatReceived(receivedAt);
  const rows = [
    ["Name", escapeHtml(quote.name)],
    ["Business", escapeHtml(quote.business)],
    ["Business type", escapeHtml(quote.businessType)],
    ["Email", `<a href="mailto:${escapeHtml(quote.email)}" style="color:#0a2d5b;">${escapeHtml(quote.email)}</a>`],
    [
      "Phone",
      quote.phone
        ? `<a href="tel:${escapeHtml(quote.phone.replace(/[^\d+]/g, ""))}" style="color:#0a2d5b;">${escapeHtml(quote.phone)}</a>`
        : `<span style="color:#586274;">No phone</span>`,
    ],
    ["Received", escapeHtml(received)],
  ];
  const cell = "padding:12px 16px;border-top:1px solid #dfe4ec;font-size:15px;line-height:1.45;vertical-align:top;";
  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="${cell}width:132px;color:#586274;">${label}</td><td style="${cell}color:#0b1222;">${value}</td></tr>`,
    )
    .join("");
  const notes = quote.message
    ? `<div style="margin:24px 0 0;border:1px solid #dfe4ec;">
  <div style="padding:10px 16px;border-bottom:1px solid #dfe4ec;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#586274;">Notes</div>
  <div style="padding:14px 16px;font-size:15px;line-height:1.5;color:#0b1222;white-space:pre-wrap;">${escapeHtml(quote.message)}</div>
</div>`
    : `<p style="margin:24px 0 0;font-size:14px;color:#586274;">No notes.</p>`;
  const button = adminUrl
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:13px 22px;background:#000924;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View all requests</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>New Tymo request</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(`${quote.name} · ${quote.businessType} · ${quote.email}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe4ec;">
<tr><td style="background:#000924;padding:16px 24px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.18em;">TYMO</td></tr>
<tr><td style="padding:28px 24px 32px;">
<p style="margin:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#586274;">New website request</p>
<h1 style="margin:8px 0 6px;font-size:24px;line-height:1.25;color:#0b1222;">${escapeHtml(quote.business)}</h1>
<p style="margin:0 0 22px;font-size:15px;color:#586274;">${escapeHtml(quote.name)} sent a request from the Tymo website.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dfe4ec;border-top:0;">${tableRows}</table>
${notes}
${button}
<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#586274;">Reply to this email to answer ${escapeHtml(quote.name)} directly.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#586274;">Sent by Tymo for every request from the quote form.</p>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    "New website request",
    "",
    `Name: ${quote.name}`,
    `Business: ${quote.business}`,
    `Business type: ${quote.businessType}`,
    `Email: ${quote.email}`,
    `Phone: ${quote.phone || "No phone"}`,
    `Received: ${received}`,
    "",
    "Notes:",
    quote.message || "No notes.",
    ...(adminUrl ? ["", `View all requests: ${adminUrl}`] : []),
    "",
    `Reply to this email to answer ${quote.name} directly.`,
  ].join("\n");
  return { subject: `New Tymo request: ${quote.business} (${quote.businessType})`, html, text };
}

/**
 * Returns `notify(quote)`, or null when TYMO_QUOTE_NOTIFY_TO is empty.
 * notify never throws: a failed email must not fail the request, which is
 * already saved. Logs carry no personal data.
 */
export function createQuoteNotifier(env = process.env, fetchImpl = fetch) {
  const to = (env.TYMO_QUOTE_NOTIFY_TO || "")
    .split(",")
    .map((addr) => addr.trim())
    .filter(validAddress);
  if (to.length === 0) return null;
  const publicUrl = env.TYMO_WEB_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : "");
  const adminUrl = publicUrl ? `${publicUrl.replace(/\/+$/, "")}/admin` : null;
  let warnedNoKey = false;

  return async function notify(quote) {
    if (!env.RESEND_API_KEY) {
      if (!warnedNoKey) console.warn("[quotes] Request emails are off: set RESEND_API_KEY and EMAIL_FROM to send them.");
      warnedNoKey = true;
      return { sent: false, reason: "no_api_key" };
    }
    const email = renderQuoteEmail(quote, { adminUrl });
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          ...(quote.id ? { "Idempotency-Key": `tymo-quote-${quote.id}` } : {}),
        },
        body: JSON.stringify({
          from: fromHeader(env.EMAIL_FROM),
          to,
          reply_to: quote.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.warn(`[quotes] Request email failed: Resend answered ${response.status}.`);
        return { sent: false, reason: `status_${response.status}` };
      }
      return { sent: true };
    } catch {
      console.warn("[quotes] Request email failed: could not reach Resend.");
      return { sent: false, reason: "network" };
    }
  };
}
