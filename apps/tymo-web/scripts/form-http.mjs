/**
 * Shared plumbing for the website's form endpoints (/api/quote and
 * /api/intake): same-origin check, per-client rate limit, bounded body
 * reads, and answers for both scripts (JSON) and native form posts (303).
 */
import { isIP } from "node:net";

const windowMs = 10 * 60 * 1000;
const attemptsPerWindow = 10;
const maxClientKeys = 4096;

/** A refused request: the HTTP status and the message the visitor sees. */
export class FormRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sameOrigin(request, behindRailway) {
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

/**
 * Returns `retryAfter(request)`: 0 while the client is under 10 attempts per
 * 10 minutes, otherwise the seconds until the window resets. Behind Railway
 * the client is the edge's X-Real-IP.
 */
export function createRateLimiter(behindRailway) {
  const attempts = new Map();
  let windowEnd = 0;

  return function retryAfter(request) {
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
  };
}

/** The request's media type without parameters, lowercased ("multipart/form-data"). */
export function mediaType(request) {
  return request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
}

/** The whole request body, refused with 413 and `tooLarge` past `limit` bytes. */
export async function readBody(request, limit, tooLarge) {
  if (Number(request.headers["content-length"]) > limit) throw new FormRequestError(413, tooLarge);
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw new FormRequestError(413, tooLarge);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export function sendJson(response, status, body, extraHeaders = {}, head = false) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  }).end(head ? undefined : JSON.stringify(body));
}

/**
 * Answers a form post: JSON for scripts, or for a browser that posted the
 * form natively (prefers HTML) a 303 to `redirects.sent` or `redirects.error`.
 */
export function formResult(request, response, status, body, extraHeaders, redirects) {
  const accept = request.headers.accept?.toLowerCase() ?? "";
  // Answered before the body was read: close rather than drain it.
  const headers = request.complete ? extraHeaders : { ...extraHeaders, connection: "close" };
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    response.writeHead(303, {
      ...headers,
      "cache-control": "no-store",
      location: body.ok ? redirects.sent : redirects.error,
    }).end();
    return;
  }
  sendJson(response, status, body, headers);
}
