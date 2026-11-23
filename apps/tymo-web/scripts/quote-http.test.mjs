import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { createQuoteHandler, renderQuotePage } from "./quote-http.mjs";

const quote = {
  name: " Avery Tester ", business: " Example Rink ", business_type: "Sports facility", email: "avery@example.test",
};
const requestId = "e7681b05-bade-4151-8212-7c1cad879a38";

async function listen(t, store = null, behindRailway = false) {
  const handleQuote = createQuoteHandler(store, behindRailway);
  const server = createServer((request, response) => handleQuote(request, response, request.url));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function submit(base, fields = quote, headers = {}) {
  return fetch(`${base}/api/quote`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { Accept: "application/json", ...headers },
    redirect: "manual",
  });
}

test("saves validated contact fields through the same-origin Railway path", async (t) => {
  let saved;
  const base = await listen(t, { save: (value) => { saved = value; } }, true);
  const response = await submit(base, { ...quote, message: "Winter\r\npractice", _request_id: requestId }, {
    Origin: "https://quote.example.test",
    "X-Forwarded-Host": "quote.example.test",
    "X-Real-IP": "192.0.2.10",
    "Sec-Fetch-Site": "same-origin",
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(saved, {
    id: requestId, name: "Avery Tester", business: "Example Rink", businessType: "Sports facility", email: "avery@example.test",
    phone: null, message: "Winter\npractice",
  });
  const listResponse = await fetch(`${base}/api/quote`);
  assert.equal(listResponse.status, 405);
  assert.equal(listResponse.headers.get("allow"), "POST");
});

test("blocks cross-origin requests, malformed input, and automation without saving data", async (t) => {
  const base = await listen(t, { save: () => assert.fail("Nothing should be stored") });
  assert.equal((await submit(base, quote, { Origin: "https://another.example.test" })).status, 403);
  assert.equal((await submit(base, quote, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await submit(base, { ...quote, email: "not an email" })).status, 400);
  assert.equal((await submit(base, { ...quote, business_type: "Not an option" })).status, 400);
  assert.equal((await submit(base, { ...quote, _request_id: "not-a-uuid" })).status, 400);
  assert.equal((await submit(base, { ...quote, message: "x".repeat(2001) })).status, 400);
  assert.equal((await submit(base, { ...quote, message: "x".repeat(33 * 1024) })).status, 413);
  assert.equal((await submit(base, [...Object.entries(quote), ["email", "dupe@example.test"]])).status, 400);
  assert.equal((await submit(base, quote, { "Content-Type": "multipart/form-data" })).status, 415);
  assert.equal((await submit(base, { ...quote, _gotcha: "automation" })).status, 201);
});

test("supports native form confirmation and signals backend unavailability", async (t) => {
  const healthy = await listen(t, { ready() {}, save() {} });
  const unavailable = await listen(t);

  const sent = await submit(healthy, quote, { Accept: "text/html" });
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get("location"), "/?quote=sent#quote");
  const failed = await submit(unavailable, quote, { Accept: "text/html" });
  assert.equal(failed.status, 303);
  assert.equal(failed.headers.get("location"), "/?quote=error#quote");

  const placeholder = Buffer.from('<p id="quote-status" role="status" tabindex="-1" hidden></p>');
  const message = renderQuotePage(placeholder, "sent").toString();
  assert.match(message, /role="status" tabindex="-1" data-state="sent" autofocus/);
  assert.match(message, /We received your quote request/);
  assert.deepEqual(renderQuotePage(placeholder, "<script>"), placeholder);

  const hiddenInput = Buffer.from('<input type="hidden" name="_request_id" value="">');
  const firstForm = renderQuotePage(hiddenInput, null).toString();
  const secondForm = renderQuotePage(hiddenInput, null).toString();
  assert.match(firstForm, /name="_request_id" value="[a-f0-9-]{36}"/);
  assert.notEqual(firstForm, secondForm);

  assert.equal((await fetch(`${healthy}/api/health`)).status, 200);
  assert.equal((await fetch(`${unavailable}/api/health`)).status, 503);
  const outcome = await submit(unavailable);
  assert.equal(outcome.status, 503);
  assert.deepEqual(await outcome.json(), {
    ok: false, message: "Quote requests are temporarily unavailable. Please try again soon.",
  });
});

test("bounds attempts and supplies Retry-After without saving extra records", async (t) => {
  let saveCount = 0;
  const base = await listen(t, { save: () => { saveCount += 1; } });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await submit(base)).status, 201);
  }
  const limited = await submit(base);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(saveCount, 10);
});
