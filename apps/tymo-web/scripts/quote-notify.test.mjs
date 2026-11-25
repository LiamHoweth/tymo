import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { createQuoteHandler } from "./quote-http.mjs";
import { createQuoteNotifier, formatReceived, renderQuoteEmail } from "./quote-notify.mjs";

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
  assert.deepEqual(await notify(quote), { sent: false, reason: "no_api_key" });
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
  assert.deepEqual(await notify(quote), { sent: true });
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
  assert.deepEqual(await refused(quote), { sent: false, reason: "status_422" });
  const offline = createQuoteNotifier(env, async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(await offline(quote), { sent: false, reason: "network" });
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

test("does not email spam traps or invalid requests, and a failing email still answers 201", async (t) => {
  const quiet = await listen(t, { save: async () => true }, () => assert.fail("nothing to email"));
  assert.equal((await submit(quiet, { ...form, _gotcha: "bot" })).status, 201);
  assert.equal((await submit(quiet, { ...form, email: "nope" })).status, 400);

  const broken = await listen(t, { save: async () => true }, async () => {
    throw new Error("mail down");
  });
  assert.equal((await submit(broken)).status, 201);
});
