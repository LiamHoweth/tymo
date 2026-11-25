import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createQuoteNotifier } from "./quote-notify.mjs";

const bodyLimit = 32 * 1024;
const windowMs = 10 * 60 * 1000;
const attemptsPerWindow = 10;
const maxClientKeys = 4096;
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
const nativeStatus = new Map([
  ["sent", "Thanks. We received your quote request."],
  ["error", "Your quote request could not be submitted. Check your details and try again."],
]);

class QuoteRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sameOrigin(request, behindRailway) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = (behindRailway && request.headers["x-forwarded-host"]) || request.headers.host;
  try {
    return origin === new URL(`${behindRailway ? "https" : "http"}://${host}`).origin;
  } catch {
    return false;
  }
}

async function readForm(request) {
  const mediaType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    throw new QuoteRequestError(415, "Submit your request using the quote form.");
  }

  let size = 0;
  const chunks = [];
  if (Number(request.headers["content-length"]) > bodyLimit) {
    throw new QuoteRequestError(413, "Your request is too large. Shorten your booking notes and try again.");
  }
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > bodyLimit) {
      throw new QuoteRequestError(413, "Your request is too large. Shorten your booking notes and try again.");
    }
    chunks.push(chunk);
  }

  const encoded = Buffer.concat(chunks, size).toString("utf8");
  const form = new Map();
  for (const [key, value] of new URLSearchParams(encoded)) {
    if (!allowedFields.has(key) || form.has(key)) {
      throw new QuoteRequestError(400, "The request has an invalid form field. Reload and try again.");
    }
    form.set(key, value);
  }
  return form;
}

function validateQuote(form) {
  const read = (key, limit) => {
    const value = (form.get(key) ?? "").trim();
    if (value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new QuoteRequestError(400, "Check the length and format of your contact details.");
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
    throw new QuoteRequestError(400, "Enter your name and business name, and choose a business type.");
  }
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    throw new QuoteRequestError(400, "Enter a valid email address so we can follow up.");
  }
  if (phone && (!/^\+?[\d ().#x-]+$/i.test(phone) || phone.replace(/\D/g, "").length < 7)) {
    throw new QuoteRequestError(400, "Enter a valid phone number or leave it blank.");
  }
  if (message.length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(message)) {
    throw new QuoteRequestError(400, "Enter up to 2,000 characters in your booking notes.");
  }
  if (id && !uuidV4.test(id)) {
    throw new QuoteRequestError(400, "Reload the quote form and try again.");
  }
  return { id, name, business, businessType, email, phone: phone || null, message: message || null };
}

function json(response, status, body, extraHeaders = {}, head = false) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  }).end(head ? undefined : JSON.stringify(body));
}

function quoteResult(request, response, status, body, extraHeaders = {}) {
  const accept = request.headers.accept?.toLowerCase() ?? "";
  const headers = request.complete ? extraHeaders : { ...extraHeaders, connection: "close" };
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    response.writeHead(303, {
      ...headers,
      "cache-control": "no-store",
      location: `/?quote=${body.ok ? "sent" : "error"}#quote`,
    }).end();
    return;
  }
  json(response, status, body, headers);
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
  const attempts = new Map();
  let windowEnd = 0;

  function retryAfter(request) {
    const now = Date.now();
    if (now >= windowEnd) {
      attempts.clear();
      windowEnd = now + windowMs;
    }
    const edgeIp = behindRailway && request.headers["x-real-ip"];
    const key = typeof edgeIp === "string" && isIP(edgeIp) ? edgeIp : request.socket.remoteAddress;
    const count = attempts.get(key) ?? 0;
    if (count >= attemptsPerWindow || (count === 0 && attempts.size >= maxClientKeys)) {
      return Math.ceil((windowEnd - now) / 1000);
    }
    attempts.set(key, count + 1);
    return 0;
  }

  return async function handleQuote(request, response, pathname) {
    const head = request.method === "HEAD";
    if (pathname === "/api/health") {
      if (request.method !== "GET" && !head) {
        json(response, 405, { status: "unavailable" }, { allow: "GET, HEAD" });
        return;
      }
      try {
        if (!store) throw new Error("Database unavailable");
        await store.ready();
        json(response, 200, { status: "ok" }, {}, head);
      } catch {
        json(response, 503, { status: "unavailable" }, {}, head);
      }
      return;
    }

    if (request.method !== "POST") {
      json(response, 405, { ok: false, message: "Submit your request using the quote form." }, { allow: "POST" }, head);
      return;
    }
    if (!sameOrigin(request, behindRailway)) {
      quoteResult(request, response, 403, { ok: false, message: "Submit your request from the Tymo website." });
      return;
    }
    const waitSeconds = retryAfter(request);
    if (waitSeconds) {
      quoteResult(request, response, 429, { ok: false, message: "Too many requests. Please wait and try again." }, {
        "retry-after": waitSeconds,
      });
      return;
    }
    try {
      const form = await readForm(request);
      if (form.get("_gotcha")?.trim()) {
        quoteResult(request, response, 201, { ok: true });
        return;
      }
      const quote = validateQuote(form);
      if (!store) throw new QuoteRequestError(503, unavailable);
      const isNew = await store.save(quote);
      quoteResult(request, response, 201, { ok: true });
      // A retried form (same request id) is not emailed twice. The email never delays or fails the response.
      if (notify && isNew !== false) void Promise.resolve(notify(quote)).catch(() => {});
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof QuoteRequestError) {
        quoteResult(request, response, error.status, { ok: false, message: error.message });
        return;
      }
      console.warn("[quotes] Could not complete a quote request.");
      quoteResult(request, response, 503, { ok: false, message: unavailable });
    }
  };
}
