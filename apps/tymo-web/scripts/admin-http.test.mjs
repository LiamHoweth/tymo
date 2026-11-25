import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAdminHandler } from "./admin-http.mjs";
import { emailStatus, formatReceived, notesPreview, requestType, websiteHref } from "./admin-render.mjs";

const devEnv = { NODE_ENV: "test" };
const firstId = "0b5f1c9e-3c1a-4f7e-9d2b-6a8e4c2f1d30";
const secondId = "7d2e9a41-8b6c-4e3f-a1d5-2c9b7e6f4a18";
const unknownId = "f3a8c2d1-5e6b-4a7c-8d9e-0f1a2b3c4d5e";
const demoId = "4c9e2b7a-1d3f-4a6e-8b5c-9f0e1d2c3b4a";
const demoTwoId = "9a1b2c3d-4e5f-4061-8a7b-6c5d4e3f2a1b";
const noWebsiteId = "2b4d6f80-1a3c-4e5f-9a7b-8c9d0e1f2a3b";
/** Quote requests. The second has no kind, like rows saved before kinds existed. */
const rows = [
  {
    id: firstId,
    created_at: new Date("2026-11-25T02:05:00Z"),
    kind: "quote",
    name: 'Avery "Ace" Tester',
    business: "<script>alert(1)</script>",
    business_type: "Sports facility",
    email: "avery@example.test",
    phone: "(555) 010-2000 x12",
    message: "Winter league\nTuesdays & Thursdays",
    email_status: "sent",
    email_detail: null,
    email_to: "team@example.test",
    email_at: "2026-11-25T02:05:03.000Z",
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
/** Demo requests from the company intake: no business type, phone or notes. */
const intakeRows = [
  {
    id: demoId,
    created_at: "2026-11-24T15:40:00.000Z",
    kind: "company_intake",
    name: "Riley Sample",
    business: "Redbud Soccer Complex",
    business_type: null,
    email: "riley@example.test",
    phone: null,
    message: null,
    website: "redbud-soccer.example.test",
    offerings: "Four turf fields by the hour\nTwo futsal courts in 90-minute blocks",
    booking_workflow: "Coaches email the front desk.\nA manager confirms <script>alert(2)</script> within a day.",
    availability: null,
    pricing_and_policies: "$80 an hour per field\n\nHalf up front to hold a slot",
    demo_priorities: "Recurring league nights",
    email_status: "not_sent",
    email_detail: "no_api_key",
    email_to: "team@example.test",
    email_at: "2026-11-24T15:40:02.000Z",
  },
  {
    id: demoTwoId,
    created_at: "2026-09-12T14:00:00.000Z",
    kind: "company_intake",
    name: "Casey Placeholder",
    business: "Lakeside Courts",
    business_type: null,
    email: "casey@example.test",
    phone: null,
    message: null,
    website: "https://courts.example.test/book",
    offerings: "Six indoor pickleball courts and two tennis courts, booked in one-hour slots, with lessons, clinics and league play on weekday evenings.",
    booking_workflow: "Walk-ins and phone calls.",
    availability: "7 AM to 10 PM every day",
    pricing_and_policies: null,
    demo_priorities: null,
    email_status: "sent",
    email_detail: null,
    email_to: "team@example.test",
    email_at: "2026-09-12T14:00:01.000Z",
  },
];
/** Both kinds, newest first, as the store lists them. */
const allRows = [rows[0], intakeRows[0], intakeRows[1], rows[1]];
const listStore = { list: async (limit) => allRows.slice(0, limit) };

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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Asserts the visible text holds these words in this order, back to back. */
function assertText(text, expected) {
  assert.match(text, new RegExp(escapeRegExp(expected)));
}

/** The markup of the card or inbox row (an <li>) holding the first link to href. */
function listItem(body, href) {
  const at = body.indexOf(`href="${href}"`);
  assert.ok(at > 0, `links to ${href}`);
  return body.slice(body.lastIndexOf("<li", at), body.indexOf("</li>", at));
}

/** Every link goes to this page, an admin page, a web address, an email address or a phone number. */
function assertSafeLinks(markup) {
  for (const [, href] of markup.matchAll(/href="([^"]*)"/g)) {
    assert.match(href, /^(#|\/|https?:\/\/|mailto:|tel:)/, href);
  }
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

test("reads a request's type, treating a missing or unknown kind as a quote", () => {
  assert.equal(requestType({ kind: "company_intake" }), "demo");
  assert.equal(requestType({ kind: "quote" }), "quote");
  assert.equal(requestType({}), "quote");
  assert.equal(requestType({ kind: null }), "quote");
  assert.equal(requestType({ kind: "newsletter" }), "quote");
});

test("links a typed website only over http or https", () => {
  assert.equal(websiteHref("redbud-soccer.example.test"), "https://redbud-soccer.example.test/");
  assert.equal(websiteHref("  https://courts.example.test/book "), "https://courts.example.test/book");
  assert.equal(websiteHref("HTTP://Courts.Example.Test"), "http://courts.example.test/");
  assert.equal(websiteHref("example.test:8080/fields"), "https://example.test:8080/fields");
  for (const value of [
    null,
    "",
    "   ",
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "javascript://example.test/%0Aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:casey@example.test",
    "not a website",
  ]) {
    assert.equal(websiteHref(value), null, JSON.stringify(value));
  }
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
  const base = await listen(t, { list: async (limit) => { requestedLimit = limit; return allRows; } });
  const cookie = await signIn(base);
  const response = await get(base, "/admin", cookie);
  assert.equal(response.status, 200);
  assertAdminHeaders(response);
  assert.equal(requestedLimit, 201);
  const body = await response.text();
  const text = visibleText(body);

  assert.doesNotMatch(body, /<script/i);
  assertSafeLinks(body);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(body, /Avery &quot;Ace&quot; Tester/);
  assert.match(text, /Website requests Sent from the Tymo website: demo requests and quote requests\. Times are Central \(CT\)\. All Demo requests Quote requests 4 requests/);
  assert.match(text, /Tue, Nov 24(, 2026)? · 8:05 PM CT/);
  assert.match(text, /Sat, Jul 4(, 2026)? · 12:30 PM CT/);
  assert.match(text, /<script>alert\(1\)<\/script> Sports facility/);
  assert.match(body, /href="mailto:avery@example\.test"/);
  assert.match(body, /href="tel:5550102000">\(555\) 010-2000 x12<\/a>/);
  assert.match(text, /jordan@example\.test No phone/);
  assert.match(text, /Winter league Tuesdays & Thursdays/);
  assert.match(text, /No notes/);
  assert.match(body, new RegExp(`<a class="row-link" href="/admin/requests/${firstId}">Avery &quot;Ace&quot; Tester</a>`));
  const order = [firstId, demoId, demoTwoId, secondId].map((id) => body.indexOf(`/admin/requests/${id}`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "keeps the store's newest-first order");
  assert.match(body, /<ul class="cards">/);
  // Wide screens: every request is a selectable row, the newest open beside the list.
  assert.match(body, new RegExp(`<a class="pick" href="/admin\\?request=${firstId}" aria-current="true">`));
  assert.match(body, new RegExp(`<a class="pick" href="/admin\\?request=${secondId}">`));
  assert.match(body, /<section class="panel selected" aria-labelledby="selected-title" tabindex="0">/);
  assert.match(text, /Team email Sent .*Team email Not recorded/);
  assert.match(text, /Notes Winter league Tuesdays & Thursdays Email to the team Sent Sent to team@example\.test · Tue, Nov 24 · 8:05 PM CT\./);
  assert.doesNotMatch(text, /Showing the newest/);
});

test("selects any request with ?request= and reads its notes, time and email status", async (t) => {
  const older = { ...rows[1], id: unknownId, name: "Older Request", message: "Line one\nLine two", email_status: "failed", email_detail: "status_422", email_to: "team@example.test" };
  let fetchedById;
  const base = await listen(t, {
    list: async (limit) => rows.slice(0, limit),
    get: async (id) => { fetchedById = id; return id === unknownId ? older : null; },
  });
  const cookie = await signIn(base);

  const second = await get(base, `/admin?request=${secondId.toUpperCase()}`, cookie);
  assert.equal(second.status, 200);
  const secondBody = await second.text();
  assert.match(secondBody, new RegExp(`<a class="pick" href="/admin\\?request=${secondId}" aria-current="true">`));
  assert.doesNotMatch(secondBody, new RegExp(`request=${firstId}" aria-current`));
  assert.match(visibleText(secondBody), /Example Studio Quote request · From Jordan Example · Sat, Jul 4, 2026 · 12:30 PM CT Open as page Notes No notes Email to the team Not recorded/);
  assert.match(secondBody, new RegExp(`<a class="button" href="/admin/requests/${secondId}">Open as page</a>`));

  // Not in the newest 200: looked up by id, still shown in full.
  const olderText = visibleText(await (await get(base, `/admin?request=${unknownId}`, cookie)).text());
  assert.equal(fetchedById, unknownId);
  assert.match(olderText, /Notes Line one Line two Email to the team Failed Resend refused it \(status 422\)\. It was going to team@example\.test\./);

  for (const wanted of ["00000000-0000-4000-8000-000000000999", "not-a-uuid"]) {
    const missingText = visibleText(await (await get(base, `/admin?request=${wanted}`, cookie)).text());
    assert.match(missingText, /That request wasn't found, so the newest one is open\./, wanted);
  }
});

test("describes every email outcome in words", () => {
  const base = { email_to: "team@example.test", email_at: "2026-11-25T02:05:03.000Z" };
  assert.deepEqual(
    [
      emailStatus({ ...base, email_status: "sent" }),
      emailStatus({ ...base, email_status: "not_sent", email_detail: "no_api_key" }),
      emailStatus({ email_status: "not_sent", email_detail: "no_inbox", email_to: null, email_at: base.email_at }),
      emailStatus({ ...base, email_status: "failed", email_detail: "network" }),
      emailStatus({ email_status: null }),
    ].map(({ label, tone }) => `${label}:${tone}`),
    ["Sent:ok", "Not sent:warn", "Not sent:warn", "Failed:danger", "Not recorded:muted"],
  );
  assert.match(emailStatus({ ...base, email_status: "not_sent", email_detail: "no_api_key" }).detail, /isn't set up yet, so this wasn't emailed to team@example\.test\. Add RESEND_API_KEY/);
  assert.match(emailStatus({ email_status: "not_sent", email_detail: "no_inbox" }).detail, /Add TYMO_QUOTE_NOTIFY_TO/);
  assert.match(emailStatus({ ...base, email_status: "failed", email_detail: "network" }).detail, /^Couldn't reach Resend\. It was going to team@example\.test\. Tried Tue, Nov 24 · 8:05 PM CT\.$/);
});

test("labels every request's type and previews demo requests from what a customer can book", async (t) => {
  const base = await listen(t);
  const body = await (await get(base, "/admin", await signIn(base))).text();
  assert.doesNotMatch(body, /<script/i);

  // Phones: cards. A demo request has no business type, phone or notes; it shows what a customer books.
  const demoCard = listItem(body, `/admin/requests/${demoId}`);
  assert.match(demoCard, /^<li class="card"><p class="kind kind-demo">Demo request<\/p><a class="row-link" /);
  assert.match(
    visibleText(demoCard),
    /^Demo request Riley Sample Received Tue, Nov 24(, 2026)? · 9:40 AM CT Business Redbud Soccer Complex Contact riley@example\.test Books Four turf fields by the hour Two futsal courts in 90-minute blocks Team email Not sent$/,
  );
  const longCard = visibleText(listItem(body, `/admin/requests/${demoTwoId}`));
  const longPreview = notesPreview(intakeRows[1].offerings);
  assert.ok(longPreview.endsWith("…"));
  assertText(longCard, `Contact casey@example.test Books ${longPreview} Team email Sent`);
  assert.doesNotMatch(longCard, /Phone|Notes|weekday evenings\./);

  const quoteCard = listItem(body, `/admin/requests/${secondId}`);
  assert.match(quoteCard, /^<li class="card"><p class="kind kind-quote">Quote request<\/p>/);
  assert.match(
    visibleText(quoteCard),
    /^Quote request Jordan Example Received Sat, Jul 4(, 2026)? · 12:30 PM CT Business Example Studio Studio or gym Contact jordan@example\.test No phone Notes No notes Team email Not recorded$/,
  );

  // Wide screens: inbox rows.
  const demoPick = listItem(body, `/admin?request=${demoId}`);
  assert.match(demoPick, /<span class="kind kind-demo">Demo request<\/span>/);
  assert.match(demoPick, /<span class="pick-sub">Redbud Soccer Complex<\/span>/);
  assert.match(demoPick, /<span class="pick-notes">Four turf fields by the hour Two futsal courts in 90-minute blocks<\/span>/);
  assert.ok(listItem(body, `/admin?request=${demoTwoId}`).includes(`<span class="pick-notes">${notesPreview(intakeRows[1].offerings, 90)}</span>`));
  const quotePick = listItem(body, `/admin?request=${firstId}`);
  assert.match(quotePick, /<span class="kind kind-quote">Quote request<\/span>/);
  assert.match(quotePick, /<span class="pick-sub">&lt;script&gt;alert\(1\)&lt;\/script&gt; · Sports facility<\/span>/);
  assert.match(quotePick, /<span class="pick-notes">Winter league Tuesdays &amp; Thursdays<\/span>/);
  assert.match(listItem(body, `/admin?request=${secondId}`), /<span class="kind kind-quote">Quote request<\/span>/);
});

test("shows a demo request's answers in order beside the list and as its own page", async (t) => {
  const base = await listen(t);
  const cookie = await signIn(base);
  const received = "Tue, Nov 24, 2026 · 9:40 AM CT";
  const sections = [
    "Answers",
    "What can a customer book? Four turf fields by the hour Two futsal courts in 90-minute blocks",
    "How does a booking come in today? Coaches email the front desk. A manager confirms <script>alert(2)</script> within a day.",
    "Pricing and policies $80 an hour per field Half up front to hold a slot",
    "What would you like to see in your demo? Recurring league nights",
    "Email to the team Not sent The email service isn't set up yet, so this wasn't emailed to team@example.test. Add RESEND_API_KEY on the Tymo website service.",
    "Contact Name Riley Sample Email riley@example.test Website redbud-soccer.example.test",
    `Request Business Redbud Soccer Complex Type Demo request Received ${received} Request ID ${demoId}`,
  ].join(" ");

  const panelBody = await (await get(base, `/admin?request=${demoId}`, cookie)).text();
  assert.doesNotMatch(panelBody, /<script/i);
  assertSafeLinks(panelBody);
  assert.match(panelBody, new RegExp(`<a class="pick" href="/admin\\?request=${demoId}" aria-current="true">`));
  assertText(visibleText(panelBody), `Redbud Soccer Complex Demo request · From Riley Sample · ${received} Open as page ${sections}`);

  const response = await get(base, `/admin/requests/${demoId}`, cookie);
  assert.equal(response.status, 200);
  assertAdminHeaders(response);
  const body = await response.text();
  assert.doesNotMatch(body, /<script/i);
  assertSafeLinks(body);
  assert.match(body, /<title>Demo request · Tymo admin<\/title>/);
  assert.match(body, /<a class="back" href="\/admin">.*All requests<\/a><h1>Redbud Soccer Complex<\/h1>/);
  const text = visibleText(body);
  assertText(text, `Redbud Soccer Complex Demo request · From Riley Sample · ${received} ${sections}`);
  // A blank optional answer is left out; quote-only lines never show.
  assert.doesNotMatch(text, /Hours and availability|No answer|Notes|Phone|Business type|Quote request/);
  // Answers keep their line breaks and are escaped.
  assert.match(body, /<h4 class="answer-label">What can a customer book\?<\/h4><p class="notes-full">Four turf fields by the hour\nTwo futsal courts in 90-minute blocks<\/p>/);
  assert.match(body, /<p class="notes-full">Coaches email the front desk\.\nA manager confirms &lt;script&gt;alert\(2\)&lt;\/script&gt; within a day\.<\/p>/);
  assert.match(body, /<p class="notes-full">\$80 an hour per field\n\nHalf up front to hold a slot<\/p>/);
  // A website typed without a scheme links over https and shows as typed.
  assert.match(body, /<a class="tap link" href="https:\/\/redbud-soccer\.example\.test\/" rel="external noreferrer">redbud-soccer\.example\.test<\/a>/);
});

test("links a demo request's website only when it is a web address and says when there is none", async (t) => {
  const variants = new Map([
    [demoTwoId, intakeRows[1]],
    [unknownId, { ...intakeRows[1], id: unknownId, website: "javascript:alert(3)" }],
    [noWebsiteId, { ...intakeRows[1], id: noWebsiteId, website: null, booking_workflow: "  " }],
  ]);
  const base = await listen(t, { list: async () => allRows, get: async (id) => variants.get(id) ?? null });
  const cookie = await signIn(base);
  const page = async (id) => {
    const response = await get(base, `/admin/requests/${id}`, cookie);
    assert.equal(response.status, 200, id);
    const body = await response.text();
    assertSafeLinks(body);
    return body;
  };

  const withScheme = await page(demoTwoId);
  assert.match(withScheme, /<a class="tap link" href="https:\/\/courts\.example\.test\/book" rel="external noreferrer">https:\/\/courts\.example\.test\/book<\/a>/);
  // Only the answers given show, in the form's order.
  assertText(
    visibleText(withScheme),
    "How does a booking come in today? Walk-ins and phone calls. Hours and availability 7 AM to 10 PM every day Email to the team Sent",
  );
  assert.doesNotMatch(visibleText(withScheme), /Pricing and policies|What would you like to see in your demo\?/);

  const script = await page(unknownId);
  assert.doesNotMatch(script, /href="javascript/i);
  assert.match(script, /<div><dt>Website<\/dt><dd>javascript:alert\(3\)<\/dd><\/div>/);

  const none = visibleText(await page(noWebsiteId));
  assertText(none, "Email casey@example.test Website No website Request");
  // A required answer that is somehow blank still shows its question.
  assertText(none, "How does a booking come in today? No answer Hours and availability");
});

test("filters the list by type and keeps ?request= working", async (t) => {
  const base = await listen(t);
  const cookie = await signIn(base);
  const filterNav = (current) => new RegExp(
    '<nav class="filter" aria-label="Request type"><ul>'
      + `<li><a class="filter-link" href="/admin"${current === "all" ? ' aria-current="page"' : ""}>All</a></li>`
      + `<li><a class="filter-link" href="/admin\\?type=demo"${current === "demo" ? ' aria-current="page"' : ""}>Demo requests</a></li>`
      + `<li><a class="filter-link" href="/admin\\?type=quote"${current === "quote" ? ' aria-current="page"' : ""}>Quote requests</a></li>`
      + "</ul></nav>",
  );
  assert.match(await (await get(base, "/admin", cookie)).text(), filterNav("all"));

  const demos = await get(base, "/admin?type=demo", cookie);
  assert.equal(demos.status, 200);
  assertAdminHeaders(demos);
  const demoBody = await demos.text();
  assert.match(demoBody, filterNav("demo"));
  assert.match(demoBody, /<title>Demo requests · Tymo admin<\/title>/);
  assert.match(demoBody, /<a href="\/admin" aria-current="true">Website requests<\/a>/);
  for (const id of [firstId, secondId]) assert.ok(!demoBody.includes(id), `leaves out quote ${id}`);
  // Rows keep the filter when picked; the newest demo request opens by default.
  assert.match(demoBody, new RegExp(`<a class="pick" href="/admin\\?type=demo&amp;request=${demoId}" aria-current="true">`));
  assert.match(demoBody, new RegExp(`<a class="pick" href="/admin\\?type=demo&amp;request=${demoTwoId}">`));
  assertText(visibleText(demoBody), "Quote requests 2 demo requests Demo request Riley Sample");
  assertText(visibleText(demoBody), "Redbud Soccer Complex Demo request · From Riley Sample");

  const quoteBody = await (await get(base, "/admin?type=quote", cookie)).text();
  assert.match(quoteBody, filterNav("quote"));
  assert.ok(!quoteBody.includes(demoId) && !quoteBody.includes(demoTwoId), "leaves out demo requests");
  assertText(visibleText(quoteBody), "Quote requests 2 quote requests");
  assert.match(quoteBody, new RegExp(`<a class="pick" href="/admin\\?type=quote&amp;request=${firstId}" aria-current="true">`));

  const picked = await (await get(base, `/admin?type=demo&request=${demoTwoId.toUpperCase()}`, cookie)).text();
  assert.match(picked, new RegExp(`<a class="pick" href="/admin\\?type=demo&amp;request=${demoTwoId}" aria-current="true">`));
  assert.doesNotMatch(picked, new RegExp(`request=${demoId}" aria-current`));
  assertText(visibleText(picked), "Lakeside Courts Demo request · From Casey Placeholder");

  // A request of the other type still opens beside the list, with no row marked.
  const other = await (await get(base, `/admin?type=quote&request=${demoId}`, cookie)).text();
  assert.doesNotMatch(other, /class="pick"[^>]*aria-current/);
  assertText(visibleText(other), "Redbud Soccer Complex Demo request · From Riley Sample");
  assert.doesNotMatch(visibleText(other), /wasn't found/);

  // An unknown type lists everything.
  const everything = await (await get(base, "/admin?type=everything", cookie)).text();
  assert.match(everything, filterNav("all"));
  assertText(visibleText(everything), "Quote requests 4 requests");

  // A type with no requests says so, and the filter stays to switch back.
  const quotesOnly = await listen(t, { list: async () => rows });
  const noDemos = await get(quotesOnly, "/admin?type=demo", await signIn(quotesOnly));
  assert.equal(noDemos.status, 200);
  const noDemosBody = await noDemos.text();
  assert.match(noDemosBody, filterNav("demo"));
  assertText(visibleText(noDemosBody), "Quote requests No demo requests Demo requests sent from the Tymo website show up here.");
  assert.doesNotMatch(noDemosBody, /class="pick"|class="card"/);
});

test("shows the 200 newest and the empty, unconnected and error states", async (t) => {
  const many = Array.from({ length: 201 }, (_, index) => ({
    ...rows[1], id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  }));
  const full = await listen(t, { list: async (limit) => many.slice(0, limit) });
  const fullCookie = await signIn(full);
  const fullText = visibleText(await (await get(full, "/admin", fullCookie)).text());
  assert.match(fullText, /Showing the newest 200\./);
  assert.doesNotMatch(fullText, /201/);
  // Filtering works on the newest 200 the store returned, and says so.
  assert.match(visibleText(await (await get(full, "/admin?type=quote", fullCookie)).text()), /Showing quote requests from the newest 200\./);
  assert.match(visibleText(await (await get(full, "/admin?type=demo", fullCookie)).text()), /No demo requests None of the newest 200 requests are demo requests\./);

  const empty = await listen(t, { list: async () => [] });
  const emptyResponse = await get(empty, "/admin", await signIn(empty));
  assert.equal(emptyResponse.status, 200);
  const emptyBody = await emptyResponse.text();
  assert.match(visibleText(emptyBody), /No requests yet Demo requests and quote requests sent from the Tymo website show up here\./);
  assert.doesNotMatch(emptyBody, /class="filter"/);

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
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[admin] Could not load website requests."]]);
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
  assert.match(body, /<p class="notes-full">Winter league\nTuesdays &amp; Thursdays<\/p>/);
  assert.match(body, /<a class="tap link" href="mailto:avery@example\.test">avery@example\.test<\/a>/);
  assert.match(body, /<a class="tap link" href="tel:5550102000">/);
  assert.match(body, /<a href="\/admin" aria-current="true">Website requests<\/a>/);
  assert.match(body, /<title>Quote request · Tymo admin<\/title>/);
  const text = visibleText(body);
  assert.match(text, /Quote request · From Avery "Ace" Tester · Tue, Nov 24, 2026 · 8:05 PM CT Notes Winter league Tuesdays & Thursdays/);
  assert.doesNotMatch(text, /Answers|Website(?! requests)|Demo request/);
  assert.match(text, /Email to the team Sent Sent to team@example\.test · Tue, Nov 24 · 8:05 PM CT\./);
  assert.match(text, /Contact Name Avery "Ace" Tester Email avery@example\.test Phone \(555\) 010-2000 x12/);
  assert.match(text, new RegExp(`Request Business <script>alert\\(1\\)</script> Business type Sports facility Received Tue, Nov 24, 2026 · 8:05 PM CT Request ID ${firstId}`));

  const second = visibleText(await (await get(base, `/admin/requests/${secondId.toUpperCase()}`, cookie)).text());
  assert.match(second, /Phone No phone/);
  assert.match(second, /Notes No notes/);
  assert.match(second, /Email to the team Not recorded This request came in before email tracking was added\./);

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
