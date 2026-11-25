/**
 * POST /api/intake: the company intake ("Book a demo") form on
 * company-intake.html. demo.js posts it as multipart/form-data; a browser
 * without scripts posts it natively as application/x-www-form-urlencoded.
 * Both are accepted. Requests are saved with the quotes (kind
 * "company_intake") and emailed like them.
 */
import { randomUUID } from "node:crypto";
import { FormRequestError, createRateLimiter, formResult, mediaType, readBody, sameOrigin, sendJson } from "./form-http.mjs";
import { createQuoteNotifier, emailAndRecord, intakeAnswers } from "./quote-notify.mjs";

const bodyLimit = 64 * 1024;
const allowedFields = new Set([
  "business", "name", "email", "website",
  "offerings", "booking_workflow", "availability", "pricing_and_policies", "demo_priorities",
  "request_type", "_subject", "_gotcha", "_request_id",
]);
const mediaTypes = new Set(["application/x-www-form-urlencoded", "multipart/form-data"]);
const answerLimits = { offerings: 4000, booking_workflow: 4000, availability: 3000, pricing_and_policies: 3000, demo_priorities: 3000 };
const requiredAnswers = new Set(["offerings", "booking_workflow"]);
const uuidV4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const domainName = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+(?:[a-z]{2,63}|xn--[a-z\d-]{1,59})$/;
const unavailable = "Demo requests are temporarily unavailable. Please try again soon.";
const useTheForm = "Submit your request using the demo request form.";
const invalidField = "The request has an invalid form field. Reload and try again.";
const page = "/company-intake.html";
const redirects = { sent: `${page}?intake=sent#company-success`, error: `${page}?intake=error#intake` };

/** A domain ("example.com/book") or an http(s) URL as typed. Other schemes, sign-in details and bare hosts are refused. */
export function isWebsite(value) {
  if (/[\s\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  const hasScheme = /^https?:\/\//i.test(value);
  // Without http(s)://, start like a domain: refuses javascript:, mailto:, //host and the like.
  if (!hasScheme && !/^[\p{L}\p{N}]/u.test(value)) return false;
  if (!hasScheme && /^[a-z][a-z\d+.-]*:(?!\d)/i.test(value)) return false;
  try {
    const url = new URL(hasScheme ? value : `https://${value}`);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      && domainName.test(url.hostname);
  } catch {
    return false;
  }
}

async function readIntakeForm(request) {
  if (!mediaTypes.has(mediaType(request))) throw new FormRequestError(415, useTheForm);
  const body = await readBody(request, bodyLimit, "Your request is too large. Shorten your answers and try again.");
  let parsed;
  try {
    parsed = await new Request("http://intake.invalid/", {
      method: "POST",
      headers: { "content-type": request.headers["content-type"] },
      body,
    }).formData();
  } catch {
    throw new FormRequestError(400, "The request could not be read. Reload the page and try again.");
  }
  const form = new Map();
  for (const [key, value] of parsed) {
    // Text fields only: no files, nothing unexpected, nothing repeated.
    if (typeof value !== "string" || !allowedFields.has(key) || form.has(key)) throw new FormRequestError(400, invalidField);
    form.set(key, value);
  }
  return form;
}

function validateIntake(form) {
  const line = (key, limit) => {
    const value = (form.get(key) ?? "").trim();
    if (value.length > limit || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
      throw new FormRequestError(400, "Check the length and format of your business details.");
    }
    return value;
  };

  const business = line("business", 160);
  const name = line("name", 120);
  const email = line("email", 254);
  const website = line("website", 300);
  const id = form.get("_request_id")?.trim() || null;
  if (!business || !name) throw new FormRequestError(400, "Enter your business name and your name.");
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    throw new FormRequestError(400, "Enter a valid email address so we can follow up.");
  }
  if (website && !isWebsite(website)) {
    throw new FormRequestError(400, "Enter your website address, like example.com, or leave it blank.");
  }
  if (id && !uuidV4.test(id)) throw new FormRequestError(400, "Reload the demo request form and try again.");

  const intake = { id, kind: "company_intake", business, name, email, website: website || null };
  for (const { key, column, label } of intakeAnswers) {
    const value = (form.get(column) ?? "").replace(/\r\n?/g, "\n").trim();
    if (value.length > answerLimits[column] || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)) {
      throw new FormRequestError(400, `Keep your answer to “${label}” within ${answerLimits[column].toLocaleString("en-US")} characters.`);
    }
    if (!value && requiredAnswers.has(column)) {
      throw new FormRequestError(400, "Tell us what a customer can book and how a booking comes in today.");
    }
    intake[key] = value || null;
  }
  return intake;
}

const formMarker = '<form id="company-form"';
const formspreeAction = 'action="https://formspree.io/f/mjybgwdr"';
const successMarker = '<div id="company-success" class="form-complete" hidden tabindex="-1">';
const statusMarker = '<p class="intake-status" role="status" data-form-status hidden></p>';
const errorMessage = "We couldn’t confirm your request. Please check your answers and try again.";

/**
 * company-intake.html as served: the form posts to /api/intake with a fresh
 * retry id, and a native post's result ("sent" or "error", from ?intake=)
 * is shown without scripts. Returns the original bytes when the form isn't
 * found; a state whose marker is missing is left out.
 */
export function renderIntakePage(body, state) {
  const html = body.toString("utf8");
  const start = html.indexOf(formMarker);
  const end = start === -1 ? -1 : html.indexOf(">", start);
  if (end === -1) return body;
  let formTag = html.slice(start, end + 1).replace(formspreeAction, 'action="/api/intake"');
  let rest = html.slice(end + 1);
  if (state === "sent" && rest.includes(successMarker)) {
    formTag = `${formTag.slice(0, -1)} hidden>`;
    rest = rest.replace(successMarker, '<div id="company-success" class="form-complete" tabindex="-1" autofocus>');
  } else if (state === "error") {
    rest = rest.replace(statusMarker, `<p class="intake-status" role="status" data-form-status tabindex="-1" autofocus>${errorMessage}</p>`);
  }
  const retryId = html.includes('name="_request_id"') ? "" : `<input type="hidden" name="_request_id" value="${randomUUID()}">`;
  return Buffer.from(html.slice(0, start) + formTag + retryId + rest);
}

/** `notify(intake)` emails each newly saved request (see quote-notify.mjs); null turns emails off. */
export function createIntakeHandler(store, behindRailway = false, notify = createQuoteNotifier()) {
  const retryAfter = createRateLimiter(behindRailway);

  return async function handleIntake(request, response) {
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, message: useTheForm }, { allow: "POST" }, request.method === "HEAD");
      return;
    }
    const result = (status, body, extraHeaders = {}) => formResult(request, response, status, body, extraHeaders, redirects);
    if (!sameOrigin(request, behindRailway)) {
      result(403, { ok: false, message: "Submit your request from the Tymo website." });
      return;
    }
    const waitSeconds = retryAfter(request);
    if (waitSeconds) {
      result(429, { ok: false, message: "Too many requests. Please wait and try again." }, { "retry-after": waitSeconds });
      return;
    }
    try {
      const form = await readIntakeForm(request);
      if (form.get("_gotcha")?.trim()) {
        result(201, { ok: true });
        return;
      }
      const intake = validateIntake(form);
      if (!store) throw new FormRequestError(503, unavailable);
      // A fixed id makes retries idempotent and lets the email's outcome be recorded against this request.
      intake.id ??= randomUUID();
      const isNew = await store.saveIntake(intake);
      result(201, { ok: true });
      // A retried form (same request id) is not emailed twice. The email never delays or fails the response.
      if (isNew !== false) void emailAndRecord(store, notify, intake);
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof FormRequestError) {
        result(error.status, { ok: false, message: error.message });
        return;
      }
      console.warn("[quotes] Could not complete a demo request.");
      result(503, { ok: false, message: unavailable });
    }
  };
}
