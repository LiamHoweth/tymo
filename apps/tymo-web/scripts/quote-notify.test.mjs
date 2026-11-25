import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { createQuoteHandler } from "./quote-http.mjs";
import {
  createQuoteNotifier, emailRecord, formatReceived, intakeAnswers, renderIntakeEmail, renderQuoteEmail, websiteHref,
} from "./quote-notify.mjs";

const quote = {
  id: "e7681b05-bade-4151-8212-7c1cad879a38",
  name: "Avery Tester",
  business: "Example Rink",
  businessType: "Sports facility",
  email: "avery@example.test",
  phone: "(405) 555-0100",
  message: "Two rinks.\nWeekend leagues.",
};

test("formats the received time in Central time", () => {
  assert.equal(formatReceived(new Date("2026-11-25T02:05:00Z")), "Tue, Nov 24 · 8:05 PM CT");
  assert.equal(formatReceived(new Date("2027-07-01T17:30:00Z")), "Thu, Jul 1 · 12:30 PM CT");
});

test("renders one clean summary with every field, notes and the admin link", () => {
  const email = renderQuoteEmail(quote, { receivedAt: new Date("2026-11-25T02:05:00Z"), adminUrl: "https://tymo.example.test/admin" });
  assert.equal(email.subject, "New Tymo request: Example Rink (Sports facility)");
  for (const line of [
    "Name: Avery Tester",
    "Business: Example Rink",
    "Business type: Sports facility",
    "Email: avery@example.test",
    "Phone: (405) 555-0100",
    "Received: Tue, Nov 24 · 8:05 PM CT",
    "Two rinks.\nWeekend leagues.",
    "View all requests: https://tymo.example.test/admin",
  ]) {
    assert.ok(email.text.includes(line), `text includes ${JSON.stringify(line)}`);
  }
  assert.match(email.html, /^<!doctype html>/);
  assert.match(email.html, /href="mailto:avery@example\.test"/);
  assert.match(email.html, /href="tel:4055550100"/);
  assert.match(email.html, /href="https:\/\/tymo\.example\.test\/admin"/);
  assert.match(email.html, /white-space:pre-wrap;">Two rinks\.\nWeekend leagues\.</);
});

test("escapes everything a visitor typed and handles missing phone and notes", () => {
  const email = renderQuoteEmail(
    { ...quote, business: "<script>alert(1)</script>", name: 'Sam "Q" & Co', phone: null, message: null },
    { adminUrl: null },
  );
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(email.html.includes("Sam &quot;Q&quot; &amp; Co"));
  assert.ok(email.text.includes("Phone: No phone"));
  assert.ok(email.text.includes("No notes."));
  assert.ok(!email.text.includes("View all requests"));
  assert.ok(!email.html.includes("View all requests"));
});

test("is off without TYMO_QUOTE_NOTIFY_TO, and waits for a Resend key", async () => {
  assert.equal(createQuoteNotifier({}), null);
  assert.equal(createQuoteNotifier({ TYMO_QUOTE_NOTIFY_TO: "not-an-email" }), null);
  const notify = createQuoteNotifier({ TYMO_QUOTE_NOTIFY_TO: "team@example.test" }, () => assert.fail("no request without a key"));
  assert.deepEqual(await notify(quote), { sent: false, reason: "no_api_key", to: ["team@example.test"] });
});

test("sends through Resend to every inbox with replies going to the requester", async () => {
  const calls = [];
  const notify = createQuoteNotifier(
    {
      TYMO_QUOTE_NOTIFY_TO: " one@example.test, two@example.test ,bad",
      RESEND_API_KEY: "test-key",
      RAILWAY_PUBLIC_DOMAIN: "tymo.example.test",
    },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  );
  assert.deepEqual(await notify(quote), { sent: true, to: ["one@example.test", "two@example.test"] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].init.headers["Idempotency-Key"], `tymo-quote-${quote.id}`);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ["one@example.test", "two@example.test"]);
  assert.equal(body.reply_to, "avery@example.test");
  assert.equal(body.from, '"Tymo requests" <requests@booktymo.com>');
  assert.equal(body.subject, "New Tymo request: Example Rink (Sports facility)");
  assert.ok(body.text.includes("View all requests: https://tymo.example.test/admin"));
});

test("never throws when Resend fails or is unreachable", async () => {
  const env = { TYMO_QUOTE_NOTIFY_TO: "team@example.test", RESEND_API_KEY: "test-key", EMAIL_FROM: "Tymo <hello@example.test>" };
  const refused = createQuoteNotifier(env, async () => new Response("{}", { status: 422 }));
  assert.deepEqual(await refused(quote), { sent: false, reason: "status_422", to: ["team@example.test"] });
  const offline = createQuoteNotifier(env, async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(await offline(quote), { sent: false, reason: "network", to: ["team@example.test"] });
});

test("turns each outcome into the record the admin page reads", () => {
  assert.deepEqual(emailRecord({ sent: true, to: ["one@example.test", "two@example.test"] }), {
    status: "sent", detail: null, to: "one@example.test, two@example.test",
  });
  assert.deepEqual(emailRecord({ sent: false, reason: "no_api_key", to: ["team@example.test"] }), {
    status: "not_sent", detail: "no_api_key", to: "team@example.test",
  });
  assert.deepEqual(emailRecord({ sent: false, reason: "no_inbox" }), { status: "not_sent", detail: "no_inbox", to: null });
  assert.deepEqual(emailRecord({ sent: false, reason: "status_500", to: ["team@example.test"] }), {
    status: "failed", detail: "status_500", to: "team@example.test",
  });
  assert.deepEqual(emailRecord(undefined), { status: "failed", detail: "unknown", to: null });
});

async function listen(t, store, notify) {
  const handleQuote = createQuoteHandler(store, false, notify);
  const server = createServer((request, response) => handleQuote(request, response, request.url));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const form = { name: "Avery Tester", business: "Example Rink", business_type: "Sports facility", email: "avery@example.test" };
const submit = (base, fields = form) =>
  fetch(`${base}/api/quote`, { method: "POST", body: new URLSearchParams(fields), headers: { Accept: "application/json" } });

test("emails each newly saved request once, after the visitor gets their answer", async (t) => {
  const emailed = [];
  let isNew = true;
  const base = await listen(t, { save: async () => isNew }, async (q) => emailed.push(q));

  assert.equal((await submit(base)).status, 201);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emailed.length, 1);
  assert.equal(emailed[0].business, "Example Rink");
  assert.equal(emailed[0].businessType, "Sports facility");

  isNew = false; // the same form retried: already saved, not emailed again
  assert.equal((await submit(base)).status, 201);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emailed.length, 1);
});

test("records each request's email outcome against its id", async (t) => {
  const saved = [];
  const recorded = [];
  const store = {
    save: async (q) => { saved.push(q.id); return true; },
    recordEmail: async (id, record) => { recorded.push({ id, ...record }); },
  };
  const sent = await listen(t, store, async () => ({ sent: true, to: ["team@example.test"] }));
  assert.equal((await submit(sent)).status, 201);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(saved[0], /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/, "a request without an id gets one");
  assert.deepEqual(recorded, [{ id: saved[0], status: "sent", detail: null, to: "team@example.test" }]);

  // No inbox configured: still recorded, so the admin page can say why nothing was sent.
  const quiet = await listen(t, store, null);
  assert.equal((await submit(quiet)).status, 201);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(recorded[1], { id: saved[1], status: "not_sent", detail: "no_inbox", to: null });

  const warn = t.mock.method(console, "warn", () => {});
  const brokenStore = { save: async () => true, recordEmail: async () => { throw new Error("db down"); } };
  const broken = await listen(t, brokenStore, async () => ({ sent: true, to: [] }));
  assert.equal((await submit(broken)).status, 201);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[quotes] Could not record a request email's result."]]);
});

test("does not email spam traps or invalid requests, and a failing email still answers 201", async (t) => {
  const quiet = await listen(t, { save: async () => true }, () => assert.fail("nothing to email"));
  assert.equal((await submit(quiet, { ...form, _gotcha: "bot" })).status, 201);
  assert.equal((await submit(quiet, { ...form, email: "nope" })).status, 400);

  const broken = await listen(t, { save: async () => true }, async () => {
    throw new Error("mail down");
  });
  assert.equal((await submit(broken)).status, 201);
});

const intake = {
  id: "3f9c1a2b-7d4e-4c8f-a1b2-c3d4e5f60718",
  kind: "company_intake",
  business: "Example Fieldhouse",
  name: "Avery Tester",
  email: "avery@example.test",
  website: "example.test/book",
  offerings: "Two turf fields.\n60-minute rentals.",
  bookingWorkflow: "Families email us, then we confirm by phone.",
  availability: null,
  pricingAndPolicies: "Half up front.",
  demoPriorities: null,
};

test("renders a demo request with every detail and each answer under its question", () => {
  const email = renderIntakeEmail(intake, { receivedAt: new Date("2026-11-25T02:05:00Z"), adminUrl: "https://tymo.example.test/admin" });
  assert.equal(email.subject, "New demo request: Example Fieldhouse");
  assert.equal(email.text, [
    "New demo request",
    "",
    "Name: Avery Tester",
    "Business: Example Fieldhouse",
    "Email: avery@example.test",
    "Website: https://example.test/book",
    "Received: Tue, Nov 24 · 8:05 PM CT",
    "",
    "What can a customer book?",
    "Two turf fields.\n60-minute rentals.",
    "",
    "How does a booking come in today?",
    "Families email us, then we confirm by phone.",
    "",
    "Pricing and policies",
    "Half up front.",
    "",
    "View all requests: https://tymo.example.test/admin",
    "",
    "Reply to this email to answer Avery Tester directly.",
  ].join("\n"));
  assert.match(email.html, /^<!doctype html>/);
  assert.match(email.html, /<title>New demo request<\/title>/);
  assert.match(email.html, />TYMO<\/td>/);
  assert.match(email.html, /<h1[^>]*>Example Fieldhouse<\/h1>/);
  assert.match(email.html, /href="mailto:avery@example\.test"/);
  assert.match(email.html, /<a href="https:\/\/example\.test\/book" style="color:#0a2d5b;">example\.test\/book<\/a>/);
  assert.match(email.html, /Tue, Nov 24 · 8:05 PM CT/);
  assert.match(email.html, />What can a customer book\?<\/div>\n  <div style="[^"]*white-space:pre-wrap;">Two turf fields\.\n60-minute rentals\.<\/div>/);
  assert.match(email.html, />Pricing and policies<\/div>/);
  assert.ok(!email.html.includes("Hours and availability"), "empty optional answers are left out");
  assert.ok(!email.html.includes("What would you like to see in your demo?"));
  assert.match(email.html, /href="https:\/\/tymo\.example\.test\/admin"[^>]*>View all requests<\/a>/);
  assert.match(email.html, /Reply to this email to answer Avery Tester directly\./);
  assert.ok(!email.html.includes("border-radius"), "square corners like the quote email");
  assert.deepEqual(intakeAnswers.map(({ column }) => column), [
    "offerings", "booking_workflow", "availability", "pricing_and_policies", "demo_priorities",
  ]);
});

test("escapes everything a visitor typed in a demo request and handles a missing website", () => {
  const email = renderIntakeEmail({
    ...intake,
    business: "<script>alert(1)</script>",
    name: 'Sam "Q" & Co',
    website: 'http://example.test/?a=<b>&c="d"',
    offerings: "<img src=x onerror=alert(1)>",
    availability: "Weekends & evenings",
  });
  assert.ok(!email.html.includes("<script>"));
  assert.ok(!email.html.includes("<img"));
  assert.ok(email.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(email.html.includes("Sam &quot;Q&quot; &amp; Co"));
  assert.ok(email.html.includes('href="http://example.test/?a=&lt;b&gt;&amp;c=&quot;d&quot;"'), "an http:// website is kept as typed");
  assert.ok(email.html.includes(">Weekends &amp; evenings</div>"));
  assert.ok(!email.html.includes("View all requests"));

  const noWebsite = renderIntakeEmail({ ...intake, website: null });
  assert.match(noWebsite.html, /<span style="color:#586274;">No website<\/span>/);
  assert.ok(noWebsite.text.includes("Website: No website"));
  assert.equal(websiteHref("HTTPS://example.test"), "HTTPS://example.test");
  assert.equal(websiteHref("javascript:alert(1)"), "https://javascript:alert(1)", "always an https link");
});

test("sends a demo request with its own template and idempotency key, replies to the requester", async () => {
  const calls = [];
  const notify = createQuoteNotifier(
    { TYMO_QUOTE_NOTIFY_TO: "team@example.test", RESEND_API_KEY: "test-key", TYMO_WEB_URL: "https://tymo.example.test/" },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "email_2" }), { status: 200 });
    },
  );
  assert.deepEqual(await notify(intake), { sent: true, to: ["team@example.test"] });
  assert.equal(calls[0].init.headers["Idempotency-Key"], `tymo-intake-${intake.id}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.subject, "New demo request: Example Fieldhouse");
  assert.equal(body.reply_to, "avery@example.test");
  assert.ok(body.text.includes("How does a booking come in today?"));
  assert.ok(body.text.includes("View all requests: https://tymo.example.test/admin"));

  // Quotes (no kind, or kind "quote") keep the quote email.
  await notify({ ...quote, kind: "quote" });
  assert.equal(JSON.parse(calls[1].init.body).subject, "New Tymo request: Example Rink (Sports facility)");
  assert.equal(calls[1].init.headers["Idempotency-Key"], `tymo-quote-${quote.id}`);
});
