import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAdminHandler } from "./admin-http.mjs";
import { formatReceived, notesPreview } from "./admin-render.mjs";

const devEnv = { NODE_ENV: "test" };
const firstId = "0b5f1c9e-3c1a-4f7e-9d2b-6a8e4c2f1d30";
const secondId = "7d2e9a41-8b6c-4e3f-a1d5-2c9b7e6f4a18";
const unknownId = "f3a8c2d1-5e6b-4a7c-8d9e-0f1a2b3c4d5e";
const rows = [
  {
    id: firstId,
    created_at: new Date("2026-11-25T02:05:00Z"),
    name: 'Avery "Ace" Tester',
    business: "<script>alert(1)</script>",
    business_type: "Sports facility",
    email: "avery@example.test",
    phone: "(555) 010-2000 x12",
    message: "Winter league\nTuesdays & Thursdays",
  },
  {
    id: secondId,
    created_at: "2026-07-04T17:30:00.000Z",
    name: "Jordan Example",
    business: "Example Studio",
    business_type: "Studio or gym",
    email: "jordan@example.test",
    phone: null,
    message: null,
  },
];
const listStore = { list: async (limit) => rows.slice(0, limit) };

async function listen(t, store = listStore, options = {}) {
  const handleAdmin = createAdminHandler(store, { env: devEnv, ...options });
  const server = createServer((request, response) => {
    handleAdmin(request, response, decodeURIComponent(request.url.split("?", 1)[0]));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const get = (base, path, cookie, method = "GET") =>
  fetch(`${base}${path}`, { method, redirect: "manual", headers: cookie ? { cookie } : {} });

const post = (base, path, fields = {}, headers = {}) =>
  fetch(`${base}${path}`, { method: "POST", body: new URLSearchParams(fields), redirect: "manual", headers });

async function signIn(base) {
  const response = await post(base, "/admin/login", { username: "admin1", password: "admin1" });
  assert.equal(response.status, 303);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

/** Visible text: markup and styles removed, entities decoded, whitespace collapsed. */
function visibleText(markup) {
  return markup
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<title>[\s\S]*?<\/title>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1")
    .trim();
}

function assertAdminHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "same-origin");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
}

test("formats Central times and one-line note previews", () => {
  const now = new Date("2026-11-24T18:00:00Z");
  assert.equal(formatReceived(new Date("2026-11-25T02:05:00Z"), { now }), "Tue, Nov 24 · 8:05 PM CT");
  assert.equal(formatReceived("2026-07-04T17:30:00Z", { now }), "Sat, Jul 4 · 12:30 PM CT");
  assert.equal(formatReceived("2025-12-31T23:59:00Z", { now }), "Wed, Dec 31, 2025 · 5:59 PM CT");
  assert.equal(formatReceived("2026-03-08T08:15:00Z", { now, withYear: true }), "Sun, Mar 8, 2026 · 3:15 AM CT");
  assert.equal(formatReceived("not a date", { now }), "Unknown time");

  assert.equal(notesPreview(null), null);
  assert.equal(notesPreview("  \n "), null);
  assert.equal(notesPreview("Line one\n\nline two"), "Line one line two");
  const long = notesPreview("word ".repeat(60));
  assert.ok(long.endsWith("…"));
  assert.ok(Array.from(long).length <= 121);
});

test("sends signed-out visitors to sign in and sets admin headers on every response", async (t) => {
  const base = await listen(t);
  for (const path of ["/admin", "/admin/", `/admin/requests/${firstId}`, "/admin/anything"]) {
    const response = await get(base, path);
    assert.equal(response.status, 303, path);
    assert.equal(response.headers.get("location"), "/admin/login");
    assertAdminHeaders(response);
  }

  const login = await get(base, "/admin/login");
  assert.equal(login.status, 200);
  assertAdminHeaders(login);
  assert.equal(login.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await login.text();
  assert.match(body, /<link rel="stylesheet" href="\/fonts.css">/);
  assert.match(body, /<form class="form" method="post" action="\/admin\/login">/);
  assert.match(body, /<label for="admin-user">Username<\/label><input [^>]*id="admin-user" name="username" type="text" autocomplete="username"/);
  assert.match(body, /<label for="admin-password">Password<\/label><input [^>]*id="admin-password" name="password" type="password" autocomplete="current-password"/);
  assert.match(body, /<p id="admin-signin-error" class="sr-only" aria-live="polite"><\/p>/);
  assert.match(visibleText(body), /Tymo Admin .*Sign in .*Sign in$/);
  assert.doesNotMatch(body, /<script/i);
  assert.doesNotMatch(body, /Sign out/);

  const head = await get(base, "/admin/login", null, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const put = await get(base, "/admin", null, "PUT");
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "GET, HEAD");
  assertAdminHeaders(put);
  const logoutPage = await get(base, "/admin/logout");
  assert.equal(logoutPage.status, 405);
  assert.equal(logoutPage.headers.get("allow"), "POST");
});

test("rejects a wrong password after a pause, keeps the username, then signs in", async (t) => {
  const base = await listen(t);
  const started = Date.now();
  const wrong = await post(base, "/admin/login", { username: " admin1 ", password: "admin2" });
  assert.ok(Date.now() - started >= 350, "waits after a mismatch");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  assertAdminHeaders(wrong);
  const wrongBody = await wrong.text();
  assert.match(wrongBody, /<p id="admin-signin-error" class="form-error" aria-live="polite">That username and password don&#39;t match.<\/p>/);
  assert.match(wrongBody, /name="username" [^>]*value="admin1" aria-invalid="true" aria-describedby="admin-signin-error"/);
  assert.match(wrongBody, /name="password" [^>]*aria-invalid="true" aria-describedby="admin-signin-error" autofocus>/);

  const missing = await post(base, "/admin/login", { username: "admin1" });
  assert.equal(missing.status, 400);
  assert.match(visibleText(await missing.text()), /Enter your username and password\./);

  const right = await post(base, "/admin/login", { username: " admin1 ", password: "admin1" });
  assert.equal(right.status, 303);
  assert.equal(right.headers.get("location"), "/admin");
  assertAdminHeaders(right);
  const setCookie = right.headers.get("set-cookie");
  assert.match(setCookie, /^tymo_admin=[A-Za-z0-9_-]+\.\d+\.[A-Za-z0-9_-]+; Max-Age=43200; Expires=[^;]+; Path=\/admin; HttpOnly; SameSite=Lax$/);
  const cookie = setCookie.split(";", 1)[0];

  const list = await get(base, "/admin", cookie);
  assert.equal(list.status, 200);
  const listBody = await list.text();
  assert.match(visibleText(listBody), /Tymo Admin Website requests Signed in as admin1 Sign out/);
  assert.match(listBody, /<form method="post" action="\/admin\/logout"><button type="submit" class="signout">Sign out<\/button><\/form>/);
  assert.match(listBody, /<a href="\/admin" aria-current="page">Website requests<\/a>/);

  const loginAgain = await get(base, "/admin/login", cookie);
  assert.equal(loginAgain.status, 303);
  assert.equal(loginAgain.headers.get("location"), "/admin");

  const tampered = await get(base, "/admin", `${cookie.slice(0, -2)}xx`);
  assert.equal(tampered.status, 303);
  assert.equal(tampered.headers.get("location"), "/admin/login");
});

test("refuses cross-site and non-form sign-in posts without setting a cookie", async (t) => {
  const base = await listen(t);
  const credentials = { username: "admin1", password: "admin1" };
  const crossOrigin = await post(base, "/admin/login", credentials, { Origin: "https://another.example.test" });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.headers.get("set-cookie"), null);
  assertAdminHeaders(crossOrigin);
  const crossSite = await post(base, "/admin/login", credentials, { "Sec-Fetch-Site": "cross-site" });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get("set-cookie"), null);

  const sameOrigin = await post(base, "/admin/login", credentials, { Origin: base, "Sec-Fetch-Site": "same-origin" });
  assert.equal(sameOrigin.status, 303);

  const json = await fetch(`${base}/admin/login`, {
    method: "POST", body: JSON.stringify(credentials), headers: { "Content-Type": "application/json" }, redirect: "manual",
  });
  assert.equal(json.status, 415);
  assert.equal(json.headers.get("set-cookie"), null);
  const large = await post(base, "/admin/login", { ...credentials, padding: "x".repeat(5000) });
  assert.equal(large.status, 413);
  assert.equal(large.headers.get("set-cookie"), null);
});

test("limits sign-in posts per client", async (t) => {
  const base = await listen(t);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await post(base, "/admin/login", { username: "admin1" })).status, 400);
  }
  const limited = await post(base, "/admin/login", { username: "admin1", password: "admin1" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("set-cookie"), null);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.match(visibleText(await limited.text()), /Too many sign-in attempts\. Wait a few minutes and try again\./);
});

test("lists requests newest first with every value escaped", async (t) => {
  let requestedLimit;
  const base = await listen(t, { list: async (limit) => { requestedLimit = limit; return rows; } });
  const cookie = await signIn(base);
  const response = await get(base, "/admin", cookie);
  assert.equal(response.status, 200);
  assertAdminHeaders(response);
  assert.equal(requestedLimit, 201);
  const body = await response.text();
  const text = visibleText(body);

  assert.doesNotMatch(body, /<script/i);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(body, /Avery &quot;Ace&quot; Tester/);
  assert.match(text, /Website requests Sent from the quote form on the Tymo website\. Times are Central \(CT\)\. 2 requests/);
  assert.match(text, /Tue, Nov 24(, 2026)? · 8:05 PM CT/);
  assert.match(text, /Sat, Jul 4(, 2026)? · 12:30 PM CT/);
  assert.match(text, /Received Name Business Contact Notes/);
  assert.match(text, /<script>alert\(1\)<\/script> Sports facility/);
  assert.match(body, /href="mailto:avery@example\.test"/);
  assert.match(body, /href="tel:5550102000">\(555\) 010-2000 x12<\/a>/);
  assert.match(text, /jordan@example\.test No phone/);
  assert.match(text, /Winter league Tuesdays & Thursdays/);
  assert.match(text, /No notes/);
  assert.match(body, new RegExp(`<a class="row-link tap" href="/admin/requests/${firstId}">Avery &quot;Ace&quot; Tester</a>`));
  assert.ok(body.indexOf(`/admin/requests/${firstId}`) < body.indexOf(`/admin/requests/${secondId}`), "keeps the store's newest-first order");
  assert.match(body, /<ul class="cards">/);
  assert.match(body, /<th scope="col">Received<\/th>/);
  assert.doesNotMatch(text, /Showing the newest/);
});

test("shows the 200 newest and the empty, unconnected and error states", async (t) => {
  const many = Array.from({ length: 201 }, (_, index) => ({
    ...rows[1], id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  }));
  const full = await listen(t, { list: async (limit) => many.slice(0, limit) });
  const fullText = visibleText(await (await get(full, "/admin", await signIn(full))).text());
  assert.match(fullText, /Showing the newest 200\./);
  assert.doesNotMatch(fullText, /201/);

  const empty = await listen(t, { list: async () => [] });
  const emptyResponse = await get(empty, "/admin", await signIn(empty));
  assert.equal(emptyResponse.status, 200);
  assert.match(visibleText(await emptyResponse.text()), /No requests yet Requests sent from the Tymo website's quote form show up here\./);

  const unconnected = await listen(t, null);
  const unconnectedResponse = await get(unconnected, "/admin", await signIn(unconnected));
  assert.equal(unconnectedResponse.status, 503);
  assertAdminHeaders(unconnectedResponse);
  assert.match(visibleText(await unconnectedResponse.text()), /The request database isn't connected\. Set TYMO_LEADS_DATABASE_URL\./);

  const warn = t.mock.method(console, "warn", () => {});
  const failing = await listen(t, { list: async () => { throw new Error("connection refused for avery@example.test"); } });
  const failingResponse = await get(failing, "/admin", await signIn(failing));
  assert.equal(failingResponse.status, 503);
  assert.match(visibleText(await failingResponse.text()), /Couldn't load requests right now\. Reload to try again\./);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[admin] Could not load quote requests."]]);
});

test("shows one request in full and a 404 for unknown or malformed ids", async (t) => {
  const base = await listen(t);
  const cookie = await signIn(base);
  const response = await get(base, `/admin/requests/${firstId}`, cookie);
  assert.equal(response.status, 200);
  assertAdminHeaders(response);
  const body = await response.text();
  assert.doesNotMatch(body, /<script/i);
  assert.match(body, /<a class="back" href="\/admin">.*All requests<\/a><h1>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h1>/);
  assert.match(body, /<dd class="notes">Winter league\nTuesdays &amp; Thursdays<\/dd>/);
  assert.match(body, /<a class="tap link" href="mailto:avery@example\.test">avery@example\.test<\/a>/);
  assert.match(body, /<a class="tap link" href="tel:5550102000">/);
  assert.match(body, /<a href="\/admin" aria-current="true">Website requests<\/a>/);
  const text = visibleText(body);
  assert.match(text, /Name Avery "Ace" Tester Business <script>alert\(1\)<\/script> Business type Sports facility/);
  assert.match(text, new RegExp(`Received Tue, Nov 24, 2026 · 8:05 PM CT Request ID ${firstId} Notes Winter league Tuesdays & Thursdays`));

  const second = visibleText(await (await get(base, `/admin/requests/${secondId.toUpperCase()}`, cookie)).text());
  assert.match(second, /Phone No phone/);
  assert.match(second, /Notes No notes/);

  for (const path of [`/admin/requests/${unknownId}`, "/admin/requests/not-a-uuid", `/admin/requests/${firstId}/extra`]) {
    const missing = await get(base, path, cookie);
    assert.equal(missing.status, 404, path);
    assertAdminHeaders(missing);
    assert.match(visibleText(await missing.text()), /Request not found No request has that ID\./);
  }
  const unknownPage = await get(base, "/admin/settings", cookie);
  assert.equal(unknownPage.status, 404);
  assert.match(visibleText(await unknownPage.text()), /Page not found/);
});

test("finds requests through the store's get(id) when it has one", async (t) => {
  const looked = [];
  const older = { ...rows[1], id: unknownId, business: "Older Rink" };
  const base = await listen(t, {
    list: async () => rows,
    get: async (id) => { looked.push(id); return id === unknownId ? older : null; },
  });
  const cookie = await signIn(base);
  const response = await get(base, `/admin/requests/${unknownId.toUpperCase()}`, cookie);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<h1>Older Rink<\/h1>/);
  assert.equal((await get(base, `/admin/requests/${firstId}`, cookie)).status, 404);
  assert.deepEqual(looked, [unknownId, firstId]);
});

test("signs out by clearing the cookie, from this site only", async (t) => {
  const base = await listen(t);
  const cookie = await signIn(base);
  const crossSite = await post(base, "/admin/logout", {}, { cookie, Origin: "https://another.example.test" });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get("set-cookie"), null);

  const response = await post(base, "/admin/logout", {}, { cookie, Origin: base });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/admin/login");
  assertAdminHeaders(response);
  assert.match(response.headers.get("set-cookie"), /^tymo_admin=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=\/admin; HttpOnly; SameSite=Lax$/);
});

test("production without admin settings shows the off notice and accepts no sign-in", async (t) => {
  const development = await listen(t);
  const developmentCookie = await signIn(development);
  const base = await listen(t, listStore, { env: { NODE_ENV: "production", SESSION_SECRET: "set-but-not-enough" } });

  const login = await get(base, "/admin/login", developmentCookie);
  assert.equal(login.status, 200);
  const body = await login.text();
  assert.match(visibleText(body), /Admin sign-in is off on this server\. Set TYMO_ADMIN_USER, TYMO_ADMIN_PASSWORD and SESSION_SECRET/);
  assert.doesNotMatch(body, /<form/);
  assert.doesNotMatch(body, /type="password"/);

  const attempt = await post(base, "/admin/login", { username: "admin1", password: "admin1" });
  assert.equal(attempt.status, 403);
  assert.equal(attempt.headers.get("set-cookie"), null);
  const list = await get(base, "/admin", developmentCookie);
  assert.equal(list.status, 303);
  assert.equal(list.headers.get("location"), "/admin/login");
});

test("production behind Railway signs in with its own settings, the forwarded host and a Secure cookie", async (t) => {
  const env = { NODE_ENV: "production", TYMO_ADMIN_USER: "operator", TYMO_ADMIN_PASSWORD: "long test password", SESSION_SECRET: "test-only" };
  const base = await listen(t, listStore, { env, behindRailway: true, mismatchDelayMs: 0 });
  const edge = { Origin: "https://admin.example.test", "X-Forwarded-Host": "admin.example.test", "X-Real-IP": "192.0.2.10" };

  assert.equal((await post(base, "/admin/login", { username: "admin1", password: "admin1" }, edge)).status, 401);
  assert.equal((await post(base, "/admin/login", { username: "operator", password: "long test password" }, { ...edge, Origin: base })).status, 403);
  const response = await post(base, "/admin/login", { username: "operator", password: "long test password" }, edge);
  assert.equal(response.status, 303);
  assert.match(response.headers.get("set-cookie"), /; Path=\/admin; HttpOnly; SameSite=Lax; Secure$/);
  const cookie = response.headers.get("set-cookie").split(";", 1)[0];
  assert.equal((await get(base, "/admin", cookie)).status, 200);
});

test("serve.mjs routes /admin to the admin pages and keeps the site and API routes", async (t) => {
  const env = { ...process.env, NODE_ENV: "development" };
  for (const name of ["TYMO_LEADS_DATABASE_URL", "RAILWAY_ENVIRONMENT_ID", "TYMO_ADMIN_USER", "TYMO_ADMIN_PASSWORD", "SESSION_SECRET"]) {
    delete env[name];
  }
  const server = spawn(process.execPath, [fileURLToPath(new URL("./serve.mjs", import.meta.url)), "0", "127.0.0.1"], {
    env, stdio: ["ignore", "pipe", "inherit"],
  });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill();
      await once(server, "exit");
    }
  });
  let output = "";
  server.stdout.setEncoding("utf8");
  const port = await new Promise((resolve, reject) => {
    server.once("exit", () => reject(new Error(`serve.mjs exited: ${output}`)));
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /listening on 127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    });
  });
  const base = `http://127.0.0.1:${port}`;

  const admin = await get(base, "/admin");
  assert.equal(admin.status, 303);
  assert.equal(admin.headers.get("location"), "/admin/login");
  assertAdminHeaders(admin);
  const login = await get(base, "/admin/login");
  assert.equal(login.status, 200);
  assert.match(await login.text(), /<h1 id="login-title">Sign in<\/h1>/);
  const cookie = await signIn(base);
  const list = await get(base, "/admin", cookie);
  assert.equal(list.status, 503);
  assert.match(visibleText(await list.text()), /The request database isn't connected/);
  assert.equal((await get(base, "/admin/fonts.css", cookie)).status, 404);

  const home = await get(base, "/");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("content-security-policy"), null);
  assert.match(await home.text(), /<html/);
  assert.equal((await get(base, "/fonts.css")).status, 200);
  assert.equal((await get(base, "/api/health")).status, 503);
  assert.equal((await get(base, "/missing.html")).status, 404);
});
