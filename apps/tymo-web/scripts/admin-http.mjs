import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
  ADMIN_COOKIE,
  ADMIN_MISMATCH_DELAY_MS,
  adminConfigFromEnv,
  clearedSessionCookie,
  credentialsMatch,
  readCookie,
  sessionCookie,
  signAdminSession,
  verifyAdminSession,
} from "./admin-auth.mjs";
import {
  renderDetailPage,
  renderListPage,
  renderLoginPage,
  renderMessagePage,
  renderNotFoundPage,
} from "./admin-render.mjs";

const listLimit = 200;
const bodyLimit = 4 * 1024;
const windowMs = 10 * 60 * 1000;
const attemptsPerWindow = 10;
const maxClientKeys = 4096;
const requestIdPath = /^\/admin\/requests\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i;
const securityHeaders = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "content-security-policy":
    "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const mismatch = "That username and password don't match.";
const useTheForm = "Sign in using the form on this page.";

class FormError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Same check as quote-http.mjs: refuse form posts from other sites.
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

async function readForm(request, message) {
  const mediaType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") throw new FormError(415, message);
  if (Number(request.headers["content-length"]) > bodyLimit) throw new FormError(413, message);

  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > bodyLimit) throw new FormError(413, message);
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks, size).toString("utf8"));
}

/**
 * Read-only admin pages for website quote requests, under /admin.
 * store: the quote store (or null when TYMO_LEADS_DATABASE_URL is unset).
 * It needs list(limit); get(id), when present, finds requests older than the newest 200.
 */
export function createAdminHandler(store, {
  behindRailway = false,
  env = process.env,
  mismatchDelayMs = ADMIN_MISMATCH_DELAY_MS,
} = {}) {
  const config = adminConfigFromEnv(env);
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

  function send(request, response, status, body, extraHeaders = {}) {
    const headers = { ...securityHeaders, ...extraHeaders };
    // A refused post may leave its body unread; don't reuse that connection.
    if (request.method === "POST" && !request.complete) headers.connection = "close";
    if (body === undefined) {
      response.writeHead(status, headers).end();
      return;
    }
    const buffer = Buffer.from(body, "utf8");
    response.writeHead(status, {
      ...headers,
      "content-type": "text/html; charset=utf-8",
      "content-length": buffer.length,
    }).end(request.method === "HEAD" ? undefined : buffer);
  }

  const redirect = (request, response, location, extraHeaders = {}) =>
    send(request, response, 303, undefined, { location, ...extraHeaders });

  function signedInUser(request) {
    if (!config.enabled) return null;
    const token = readCookie(request.headers.cookie, ADMIN_COOKIE);
    return token ? verifyAdminSession(config, token)?.user ?? null : null;
  }

  function notAllowed(request, response, allow) {
    send(request, response, 405, renderMessagePage({
      title: "Not available",
      message: "This address doesn't accept that kind of request.",
    }), { allow });
  }

  async function login(request, response) {
    const loginPage = (status, options = {}, extraHeaders = {}) =>
      send(request, response, status, renderLoginPage({ enabled: config.enabled, ...options }), extraHeaders);

    if (!sameOrigin(request, behindRailway)) {
      loginPage(403, { error: "Sign in from the Tymo admin page." });
      return;
    }
    if (!config.enabled) {
      loginPage(403);
      return;
    }
    const waitSeconds = retryAfter(request);
    if (waitSeconds) {
      loginPage(429, { error: "Too many sign-in attempts. Wait a few minutes and try again." }, {
        "retry-after": String(waitSeconds),
      });
      return;
    }

    let form;
    try {
      form = await readForm(request, useTheForm);
    } catch (error) {
      if (!(error instanceof FormError)) throw error;
      if (!response.destroyed) loginPage(error.status, { error: error.message });
      return;
    }
    // The username is trimmed; the password is taken exactly as typed.
    const user = (form.get("username") ?? "").trim();
    const password = form.get("password") ?? "";
    if (!user || !password) {
      loginPage(400, { user, error: "Enter your username and password.", invalid: true });
      return;
    }
    if (!credentialsMatch(config, user, password)) {
      await delay(mismatchDelayMs);
      if (!response.destroyed) loginPage(401, { user, error: mismatch, invalid: true });
      return;
    }
    const now = Date.now();
    const { token, expiresAt } = signAdminSession(config, now);
    redirect(request, response, "/admin", { "set-cookie": sessionCookie(token, expiresAt, behindRailway, now) });
  }

  async function logout(request, response) {
    const refuse = (status) => send(request, response, status, renderMessagePage({
      title: "Couldn't sign out",
      message: "Use the Sign out button on the admin page.",
    }));
    if (!sameOrigin(request, behindRailway)) {
      refuse(403);
      return;
    }
    try {
      await readForm(request, "");
    } catch (error) {
      if (!(error instanceof FormError)) throw error;
      if (!response.destroyed) refuse(error.status);
      return;
    }
    redirect(request, response, "/admin/login", { "set-cookie": clearedSessionCookie(behindRailway) });
  }

  async function listPage(request, response, user) {
    if (!store) {
      send(request, response, 503, renderListPage({ user, problem: "unconnected" }));
      return;
    }
    let rows;
    try {
      // One extra row tells us whether there are more than we show.
      rows = await store.list(listLimit + 1);
    } catch {
      console.warn("[admin] Could not load quote requests.");
      send(request, response, 503, renderListPage({ user, problem: "error" }));
      return;
    }
    send(request, response, 200, renderListPage({
      user,
      rows: rows.slice(0, listLimit),
      truncated: rows.length > listLimit,
    }));
  }

  async function findRequest(id) {
    if (typeof store.get === "function") return (await store.get(id)) ?? null;
    const rows = await store.list(listLimit);
    return rows.find((row) => String(row.id).toLowerCase() === id) ?? null;
  }

  async function detailPage(request, response, user, pathname) {
    const match = requestIdPath.exec(pathname);
    if (!match) {
      send(request, response, 404, renderNotFoundPage({ user, kind: "request" }));
      return;
    }
    if (!store) {
      send(request, response, 503, renderDetailPage({ user, problem: "unconnected" }));
      return;
    }
    let row;
    try {
      row = await findRequest(match[1].toLowerCase());
    } catch {
      console.warn("[admin] Could not load a quote request.");
      send(request, response, 503, renderDetailPage({ user, problem: "error" }));
      return;
    }
    if (!row) {
      send(request, response, 404, renderNotFoundPage({ user, kind: "request" }));
      return;
    }
    send(request, response, 200, renderDetailPage({ user, row }));
  }

  async function route(request, response, pathname) {
    const reading = request.method === "GET" || request.method === "HEAD";
    if (pathname === "/admin/login") {
      if (request.method === "POST") {
        await login(request, response);
      } else if (!reading) {
        notAllowed(request, response, "GET, HEAD, POST");
      } else if (signedInUser(request)) {
        redirect(request, response, "/admin");
      } else {
        send(request, response, 200, renderLoginPage({ enabled: config.enabled }));
      }
      return;
    }
    if (pathname === "/admin/logout") {
      if (request.method === "POST") await logout(request, response);
      else notAllowed(request, response, "POST");
      return;
    }
    if (!reading) {
      notAllowed(request, response, "GET, HEAD");
      return;
    }

    const user = signedInUser(request);
    if (!user) {
      redirect(request, response, "/admin/login");
    } else if (pathname === "/admin") {
      await listPage(request, response, user);
    } else if (pathname === "/admin/") {
      redirect(request, response, "/admin");
    } else if (pathname.startsWith("/admin/requests/")) {
      await detailPage(request, response, user, pathname);
    } else {
      send(request, response, 404, renderNotFoundPage({ user }));
    }
  }

  /** Handles /admin and every path under /admin/. */
  return async function handleAdmin(request, response, pathname) {
    try {
      await route(request, response, pathname);
    } catch {
      console.warn("[admin] Could not complete an admin request.");
      if (!response.headersSent) {
        send(request, response, 500, renderMessagePage({
          title: "Something went wrong",
          message: "Reload to try again.",
        }));
      } else {
        response.destroy();
      }
    }
  };
}
