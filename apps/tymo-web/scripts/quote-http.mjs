import { randomUUID } from "node:crypto";
import { FormRequestError, createRateLimiter, formResult, mediaType, readBody, sameOrigin, sendJson } from "./form-http.mjs";
import { createQuoteNotifier, emailAndRecord } from "./quote-notify.mjs";

const bodyLimit = 32 * 1024;
const allowedFields = new Set(["name", "business", "business_type", "email", "phone", "message", "_gotcha", "_request_id"]);
const uuidV4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const businessTypes = new Set([
  "Salon or barbershop",
  "Studio or gym",
  "Spa or wellness practice",
  "Event venue or meeting space",
  "Sports facility",
  "Coaching or lessons",
  "Pet care",
  "Another business",
]);
const unavailable = "Quote requests are temporarily unavailable. Please try again soon.";
const redirects = { sent: "/?quote=sent#quote", error: "/?quote=error#quote" };
const nativeStatus = new Map([
  ["sent", "Thanks. We received your quote request."],
  ["error", "Your quote request could not be submitted. Check your details and try again."],
]);

async function readForm(request) {
  if (mediaType(request) !== "application/x-www-form-urlencoded") {
    throw new FormRequestError(415, "Submit your request using the quote form.");
  }
  const body = await readBody(request, bodyLimit, "Your request is too large. Shorten your booking notes and try again.");
  const form = new Map();
  for (const [key, value] of new URLSearchParams(body.toString("utf8"))) {
    if (!allowedFields.has(key) || form.has(key)) {
      throw new FormRequestError(400, "The request has an invalid form field. Reload and try again.");
    }
    form.set(key, value);
  }
  return form;
}

function validateQuote(form) {
  const read = (key, limit) => {
    const value = (form.get(key) ?? "").trim();
    if (value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new FormRequestError(400, "Check the length and format of your contact details.");
    }
    return value;
  };

  const name = read("name", 100);
  const business = read("business", 140);
  const businessType = read("business_type", 100);
  const email = read("email", 254);
  const phone = read("phone", 40);
  const id = form.get("_request_id")?.trim() || null;
  const message = (form.get("message") ?? "").replace(/\r\n?/g, "\n").trim();

  if (!name || !business || !businessTypes.has(businessType)) {
    throw new FormRequestError(400, "Enter your name and business name, and choose a business type.");
  }
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    throw new FormRequestError(400, "Enter a valid email address so we can follow up.");
  }
  if (phone && (!/^\+?[\d ().#x-]+$/i.test(phone) || phone.replace(/\D/g, "").length < 7)) {
    throw new FormRequestError(400, "Enter a valid phone number or leave it blank.");
  }
  if (message.length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(message)) {
    throw new FormRequestError(400, "Enter up to 2,000 characters in your booking notes.");
  }
  if (id && !uuidV4.test(id)) {
    throw new FormRequestError(400, "Reload the quote form and try again.");
  }
  return { id, name, business, businessType, email, phone: phone || null, message: message || null };
}

/** Give each form a unique retry identifier and render any native form status. */
export function renderQuotePage(body, state) {
  const form = body.toString("utf8").replace(
    '<input type="hidden" name="_request_id" value="">',
    `<input type="hidden" name="_request_id" value="${randomUUID()}">`,
  );
  const message = nativeStatus.get(state);
  if (!message) return Buffer.from(form);
  return Buffer.from(form.replace(
    '<p id="quote-status" role="status" tabindex="-1" hidden></p>',
    `<p id="quote-status" role="status" tabindex="-1" data-state="${state}" autofocus>${message}</p>`,
  ));
}

/** `notify(quote)` emails each newly saved request (see quote-notify.mjs); null turns emails off. */
export function createQuoteHandler(store, behindRailway = false, notify = createQuoteNotifier()) {
  const retryAfter = createRateLimiter(behindRailway);

  return async function handleQuote(request, response, pathname) {
    const head = request.method === "HEAD";
    if (pathname === "/api/health") {
      if (request.method !== "GET" && !head) {
        sendJson(response, 405, { status: "unavailable" }, { allow: "GET, HEAD" });
        return;
      }
      try {
        if (!store) throw new Error("Database unavailable");
        await store.ready();
        sendJson(response, 200, { status: "ok" }, {}, head);
      } catch {
        sendJson(response, 503, { status: "unavailable" }, {}, head);
      }
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, message: "Submit your request using the quote form." }, { allow: "POST" }, head);
      return;
    }
    const quoteResult = (status, body, extraHeaders = {}) =>
      formResult(request, response, status, body, extraHeaders, redirects);
    if (!sameOrigin(request, behindRailway)) {
      quoteResult(403, { ok: false, message: "Submit your request from the Tymo website." });
      return;
    }
    const waitSeconds = retryAfter(request);
    if (waitSeconds) {
      quoteResult(429, { ok: false, message: "Too many requests. Please wait and try again." }, { "retry-after": waitSeconds });
      return;
    }
    try {
      const form = await readForm(request);
      if (form.get("_gotcha")?.trim()) {
        quoteResult(201, { ok: true });
        return;
      }
      const quote = validateQuote(form);
      if (!store) throw new FormRequestError(503, unavailable);
      // A fixed id lets the email's outcome be recorded against this request.
      quote.id ??= randomUUID();
      const isNew = await store.save(quote);
      quoteResult(201, { ok: true });
      // A retried form (same request id) is not emailed twice. The email never delays or fails the response.
      if (isNew !== false) void emailAndRecord(store, notify, quote);
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof FormRequestError) {
        quoteResult(error.status, { ok: false, message: error.message });
        return;
      }
      console.warn("[quotes] Could not complete a quote request.");
      quoteResult(503, { ok: false, message: unavailable });
    }
  };
}
