/**
 * Emails each new request from the Tymo website (the quote form and the
 * company intake form) to the inboxes in TYMO_QUOTE_NOTIFY_TO, through
 * Resend's HTTP API (RESEND_API_KEY). Replies go straight to the person who
 * sent the request.
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

/** The company intake's written answers, in form order, with the question each answers. */
export const intakeAnswers = [
  { key: "offerings", column: "offerings", label: "What can a customer book?" },
  { key: "bookingWorkflow", column: "booking_workflow", label: "How does a booking come in today?" },
  { key: "availability", column: "availability", label: "Hours and availability" },
  { key: "pricingAndPolicies", column: "pricing_and_policies", label: "Pricing and policies" },
  { key: "demoPriorities", column: "demo_priorities", label: "What would you like to see in your demo?" },
];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const validAddress = (value) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value);

/** A link for a website as typed: kept when it starts with http(s)://, otherwise https:// is added. */
export function websiteHref(website) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

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

const link = (href, label) => `<a href="${escapeHtml(href)}" style="color:#0a2d5b;">${escapeHtml(label)}</a>`;
const muted = (label) => `<span style="color:#586274;">${label}</span>`;

/** A bordered block with an uppercase label over pre-wrapped text. */
function textBlock(label, value) {
  return `<div style="margin:24px 0 0;border:1px solid #dfe4ec;">
  <div style="padding:10px 16px;border-bottom:1px solid #dfe4ec;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#586274;">${escapeHtml(label)}</div>
  <div style="padding:14px 16px;font-size:15px;line-height:1.5;color:#0b1222;white-space:pre-wrap;">${escapeHtml(value)}</div>
</div>`;
}

/** The shared square-cornered email: navy TYMO band, details table, then `body`. Every argument is already HTML. */
function emailLayout({ title, preheader, kicker, heading, lead, rows, body, adminUrl, replyName, footer }) {
  const cell = "padding:12px 16px;border-top:1px solid #dfe4ec;font-size:15px;line-height:1.45;vertical-align:top;";
  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="${cell}width:132px;color:#586274;">${label}</td><td style="${cell}color:#0b1222;">${value}</td></tr>`,
    )
    .join("");
  const button = adminUrl
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:13px 22px;background:#000924;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View all requests</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe4ec;">
<tr><td style="background:#000924;padding:16px 24px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.18em;">TYMO</td></tr>
<tr><td style="padding:28px 24px 32px;">
<p style="margin:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#586274;">${kicker}</p>
<h1 style="margin:8px 0 6px;font-size:24px;line-height:1.25;color:#0b1222;">${heading}</h1>
<p style="margin:0 0 22px;font-size:15px;color:#586274;">${lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dfe4ec;border-top:0;">${tableRows}</table>
${body}
${button}
<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#586274;">Reply to this email to answer ${replyName} directly.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#586274;">${footer}</p>
</td></tr>
</table>
</body>
</html>`;
}

/** One clean summary of a quote request: subject, HTML and plain text. */
export function renderQuoteEmail(quote, { receivedAt = new Date(), adminUrl = null } = {}) {
  const received = formatReceived(receivedAt);
  const html = emailLayout({
    title: "New Tymo request",
    preheader: escapeHtml(`${quote.name} · ${quote.businessType} · ${quote.email}`),
    kicker: "New website request",
    heading: escapeHtml(quote.business),
    lead: `${escapeHtml(quote.name)} sent a request from the Tymo website.`,
    rows: [
      ["Name", escapeHtml(quote.name)],
      ["Business", escapeHtml(quote.business)],
      ["Business type", escapeHtml(quote.businessType)],
      ["Email", link(`mailto:${quote.email}`, quote.email)],
      ["Phone", quote.phone ? link(`tel:${quote.phone.replace(/[^\d+]/g, "")}`, quote.phone) : muted("No phone")],
      ["Received", escapeHtml(received)],
    ],
    body: quote.message
      ? textBlock("Notes", quote.message)
      : `<p style="margin:24px 0 0;font-size:14px;color:#586274;">No notes.</p>`,
    adminUrl,
    replyName: escapeHtml(quote.name),
    footer: "Sent by Tymo for every request from the quote form.",
  });
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

/** One clean summary of a company intake (demo request): subject, HTML and plain text. Empty optional answers are left out. */
export function renderIntakeEmail(intake, { receivedAt = new Date(), adminUrl = null } = {}) {
  const received = formatReceived(receivedAt);
  const answers = intakeAnswers.filter(({ key }) => intake[key]);
  const html = emailLayout({
    title: "New demo request",
    preheader: escapeHtml(`${intake.name} · ${intake.email}`),
    kicker: "New demo request",
    heading: escapeHtml(intake.business),
    lead: `${escapeHtml(intake.name)} asked for a demo from the Tymo website.`,
    rows: [
      ["Name", escapeHtml(intake.name)],
      ["Business", escapeHtml(intake.business)],
      ["Email", link(`mailto:${intake.email}`, intake.email)],
      ["Website", intake.website ? link(websiteHref(intake.website), intake.website) : muted("No website")],
      ["Received", escapeHtml(received)],
    ],
    body: answers.map(({ key, label }) => textBlock(label, intake[key])).join("\n"),
    adminUrl,
    replyName: escapeHtml(intake.name),
    footer: "Sent by Tymo for every demo request from the company intake form.",
  });
  const text = [
    "New demo request",
    "",
    `Name: ${intake.name}`,
    `Business: ${intake.business}`,
    `Email: ${intake.email}`,
    `Website: ${intake.website ? websiteHref(intake.website) : "No website"}`,
    `Received: ${received}`,
    ...answers.flatMap(({ key, label }) => ["", label, intake[key]]),
    ...(adminUrl ? ["", `View all requests: ${adminUrl}`] : []),
    "",
    `Reply to this email to answer ${intake.name} directly.`,
  ].join("\n");
  return { subject: `New demo request: ${intake.business}`, html, text };
}

/**
 * Returns `notify(request)`, or null when TYMO_QUOTE_NOTIFY_TO is empty.
 * A request with kind "company_intake" gets the demo request email; every
 * other request is a quote. notify never throws: a failed email must not
 * fail the request, which is already saved. Logs carry no personal data.
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

  return async function notify(request) {
    if (!env.RESEND_API_KEY) {
      if (!warnedNoKey) console.warn("[quotes] Request emails are off: set RESEND_API_KEY and EMAIL_FROM to send them.");
      warnedNoKey = true;
      return { sent: false, reason: "no_api_key", to };
    }
    const isIntake = request.kind === "company_intake";
    const email = isIntake ? renderIntakeEmail(request, { adminUrl }) : renderQuoteEmail(request, { adminUrl });
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          ...(request.id ? { "Idempotency-Key": `tymo-${isIntake ? "intake" : "quote"}-${request.id}` } : {}),
        },
        body: JSON.stringify({
          from: fromHeader(env.EMAIL_FROM),
          to,
          reply_to: request.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.warn(`[quotes] Request email failed: Resend answered ${response.status}.`);
        return { sent: false, reason: `status_${response.status}`, to };
      }
      return { sent: true, to };
    } catch {
      console.warn("[quotes] Request email failed: could not reach Resend.");
      return { sent: false, reason: "network", to };
    }
  };
}

/**
 * What the admin page shows for a request's email, from notify's outcome
 * (or { sent: false, reason: "no_inbox" } when TYMO_QUOTE_NOTIFY_TO is empty).
 * status: "sent" | "not_sent" (email not set up) | "failed".
 */
export function emailRecord(outcome) {
  const to = (outcome?.to ?? []).join(", ").slice(0, 500) || null;
  if (outcome?.sent) return { status: "sent", detail: null, to };
  if (outcome?.reason === "no_api_key" || outcome?.reason === "no_inbox") {
    return { status: "not_sent", detail: outcome.reason, to };
  }
  return { status: "failed", detail: String(outcome?.reason ?? "unknown").slice(0, 200), to };
}

/**
 * Sends a saved request's email, then records how it went against its id
 * for the admin page (`store.recordEmail`). Shared by every form handler.
 * Never throws.
 */
export async function emailAndRecord(store, notify, request) {
  try {
    const outcome = notify ? await notify(request) : { sent: false, reason: "no_inbox" };
    if (typeof store.recordEmail === "function") await store.recordEmail(request.id, emailRecord(outcome));
  } catch {
    console.warn("[quotes] Could not record a request email's result.");
  }
}
