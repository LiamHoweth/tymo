import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import { createIntakeHandler, isWebsite, renderIntakePage } from "./intake-http.mjs";

const requestId = "3f9c1a2b-7d4e-4c8f-a1b2-c3d4e5f60718";
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
// Every field company-intake.html sends, with the blank optional answers a browser includes.
const fields = {
  _subject: "Tymo demo request — company intake",
  request_type: "Company intake",
  _gotcha: "",
  business: " Example Fieldhouse ",
  name: " Avery Tester ",
  email: "avery@example.test",
  website: "example.test/book",
  offerings: "Two turf fields\r\n60-minute rentals\twith lights",
  booking_workflow: "  Families email us, then we confirm by phone.  ",
  availability: "",
  pricing_and_policies: "",
  demo_priorities: "Deposits and rain-outs",
};
const saved = {
  kind: "company_intake",
  business: "Example Fieldhouse",
  name: "Avery Tester",
  email: "avery@example.test",
  website: "example.test/book",
  offerings: "Two turf fields\n60-minute rentals\twith lights",
  bookingWorkflow: "Families email us, then we confirm by phone.",
  availability: null,
  pricingAndPolicies: null,
  demoPriorities: "Deposits and rain-outs",
};
const sentLocation = "/company-intake.html?intake=sent#company-success";
const errorLocation = "/company-intake.html?intake=error#intake";

async function listen(t, store = null, { behindRailway = false, notify = null } = {}) {
  const handleIntake = createIntakeHandler(store, behindRailway, notify);
  const server = createServer((request, response) => handleIntake(request, response));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const entriesOf = (values) => (Array.isArray(values) ? values : Object.entries(values));

/** Posts like demo.js: multipart/form-data built by FormData. */
function multipart(base, values = fields, headers = {}) {
  const body = new FormData();
  for (const [key, value] of entriesOf(values)) body.append(key, value);
  return fetch(`${base}/api/intake`, {
    method: "POST", body, headers: { Accept: "application/json", ...headers }, redirect: "manual",
  });
}

/** Posts like a browser without scripts: application/x-www-form-urlencoded. */
function urlencoded(base, values = fields, headers = {}) {
  return fetch(`${base}/api/intake`, {
    method: "POST", body: new URLSearchParams(entriesOf(values)), headers: { Accept: "application/json", ...headers }, redirect: "manual",
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("saves a multipart intake the way demo.js sends it, through the same-origin Railway path", async (t) => {
  const intakes = [];
  const base = await listen(t, { saveIntake: async (intake) => { intakes.push(intake); return true; } }, { behindRailway: true });
  const response = await multipart(base, { ...fields, _request_id: requestId }, {
    Origin: "https://tymo.example.test",
    "X-Forwarded-Host": "tymo.example.test",
    "X-Real-IP": "192.0.2.10",
    "Sec-Fetch-Site": "same-origin",
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(intakes, [{ id: requestId, ...saved }]);
});

test("saves the same form posted natively as urlencoded and redirects to the success state", async (t) => {
  const intakes = [];
  const base = await listen(t, { saveIntake: async (intake) => { intakes.push(intake); return true; } });
  const response = await urlencoded(base, { ...fields, website: "https://Example.test/Book?ref=1" }, {
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), sentLocation);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(intakes.length, 1);
  assert.match(intakes[0].id, uuid, "a request without an id gets one");
  assert.deepEqual({ ...intakes[0], id: undefined }, { id: undefined, ...saved, website: "https://Example.test/Book?ref=1" });

  // Only the required answers: every optional one is saved as null.
  const minimal = { business: "Example Studio", name: "Jordan Example", email: "jordan@example.test", offerings: "Classes", booking_workflow: "Phone" };
  assert.equal((await multipart(base, minimal)).status, 201);
  assert.deepEqual({ ...intakes[1], id: undefined }, {
    id: undefined, kind: "company_intake", business: "Example Studio", name: "Jordan Example", email: "jordan@example.test",
    website: null, offerings: "Classes", bookingWorkflow: "Phone", availability: null, pricingAndPolicies: null, demoPriorities: null,
  });
});

test("refuses invalid answers with 400 and saves nothing", async (t) => {
  // A fresh handler per post keeps these under the per-client rate limit.
  const fresh = () => listen(t, { saveIntake: () => assert.fail("Nothing should be stored") });
  const invalid = [
    { business: "" },
    { business: "   " },
    { name: "" },
    { email: "" },
    { email: "not an email" },
    { email: "avery@example" },
    { offerings: "" },
    { booking_workflow: " \r\n " },
    { business: "x".repeat(161) },
    { name: "x".repeat(121) },
    { email: `${"x".repeat(245)}@example.test` },
    { website: `example.test/${"x".repeat(300)}` },
    { offerings: "x".repeat(4001) },
    { booking_workflow: "x".repeat(4001) },
    { availability: "x".repeat(3001) },
    { pricing_and_policies: "x".repeat(3001) },
    { demo_priorities: "x".repeat(3001) },
    { name: "Avery\nTester" },
    { business: "Example\tFieldhouse" },
    { name: "Avery\u0007" },
    { offerings: "Fields\u0000" },
    { demo_priorities: "Deposits\u001b[31m" },
    { availability: "Weekends\u0085" },
    { website: "javascript:alert(1)" },
    { website: "mailto:avery@example.test" },
    { website: "ftp://example.test" },
    { website: "localhost" },
    { website: "https://user:secret@example.test" },
    { _request_id: "not-a-uuid" },
  ];
  for (const change of invalid) {
    const response = await multipart(await fresh(), { ...fields, ...change });
    assert.equal(response.status, 400, JSON.stringify(change).slice(0, 80));
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(typeof body.message, "string");
  }
  const base = await fresh();
  assert.deepEqual(await (await multipart(base, { ...fields, email: "nope" })).json(), {
    ok: false, message: "Enter a valid email address so we can follow up.",
  });
  assert.deepEqual(await (await urlencoded(base, { ...fields, offerings: "x".repeat(4001) })).json(), {
    ok: false, message: "Keep your answer to “What can a customer book?” within 4,000 characters.",
  });
  // Lengths count after CRLF becomes LF, as the browser's maxlength does.
  const atLimit = await listen(t, { saveIntake: async () => true });
  assert.equal((await multipart(atLimit, { ...fields, offerings: `${"x".repeat(3998)}\r\n` + "x" })).status, 201);
});

test("checks websites: a domain or an http(s) URL, kept as typed", () => {
  for (const value of [
    "example.test", "www.example.com", "example.com/book", "https://example.com/book?x=1", "HTTP://Example.com",
    "example.com:8080/rentals", "bücher.example", "sub.example.co.uk",
  ]) {
    assert.equal(isWebsite(value), true, value);
  }
  for (const value of [
    "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,hi", "mailto:avery@example.test", "ftp://example.test",
    "//example.com", "/book", "example", "localhost:3000", "http://localhost", "https://192.168.0.1", "exa mple.com",
    "https://user@example.com", "https://", "example..com", "-example.com", "example.com\u0000",
  ]) {
    assert.equal(isWebsite(value), false, value);
  }
});

test("rejects unknown, repeated and file fields, other encodings, and oversized bodies", async (t) => {
  const store = { saveIntake: () => assert.fail("Nothing should be stored") };
  let base = await listen(t, store);
  const invalidField = { ok: false, message: "The request has an invalid form field. Reload and try again." };

  const unknown = await urlencoded(base, { ...fields, phone: "555-0100" });
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), invalidField);
  assert.equal((await multipart(base, { ...fields, business_type: "Sports facility" })).status, 400);
  assert.equal((await multipart(base, [...Object.entries(fields), ["email", "dupe@example.test"]])).status, 400);
  assert.equal((await urlencoded(base, [...Object.entries(fields), ["_request_id", requestId], ["_request_id", requestId]])).status, 400);

  const withFile = new FormData();
  for (const [key, value] of Object.entries(fields)) if (key !== "offerings") withFile.append(key, value);
  withFile.append("offerings", new Blob(["Two fields"], { type: "text/plain" }), "offerings.txt");
  const file = await fetch(`${base}/api/intake`, { method: "POST", body: withFile, headers: { Accept: "application/json" } });
  assert.equal(file.status, 400);
  assert.deepEqual(await file.json(), invalidField);
  const extraFile = new FormData();
  for (const [key, value] of Object.entries(fields)) extraFile.append(key, value);
  extraFile.append("attachment", new Blob(["%PDF"]), "menu.pdf");
  assert.equal((await fetch(`${base}/api/intake`, { method: "POST", body: extraFile, headers: { Accept: "application/json" } })).status, 400);

  base = await listen(t, store); // stay under the per-client rate limit
  const post = (body, contentType) => fetch(`${base}/api/intake`, {
    method: "POST", body, headers: { Accept: "application/json", "Content-Type": contentType },
  });
  assert.equal((await post(JSON.stringify(fields), "application/json")).status, 415);
  assert.equal((await post("business=x", "text/plain")).status, 415);
  assert.equal((await post("--x\r\n", "multipart/form-data")).status, 400, "multipart without a boundary");
  assert.equal((await post("not multipart at all", "multipart/form-data; boundary=abc")).status, 400);

  const tooLarge = await multipart(base, { ...fields, offerings: "x".repeat(65 * 1024) });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { ok: false, message: "Your request is too large. Shorten your answers and try again." });

  const get = await fetch(`${base}/api/intake`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal((await fetch(`${base}/api/intake`, { method: "HEAD" })).status, 405);
});

test("pretends success for the honeypot without saving or emailing", async (t) => {
  const base = await listen(t, { saveIntake: () => assert.fail("Nothing should be stored") }, {
    notify: () => assert.fail("Nothing should be emailed"),
  });
  const response = await multipart(base, { ...fields, _gotcha: "https://spam.example.test" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  // Even an otherwise invalid automated post looks accepted.
  assert.equal((await urlencoded(base, { _gotcha: "bot", email: "nope" })).status, 201);
  const native = await urlencoded(base, { ...fields, _gotcha: "bot" }, { Accept: "text/html" });
  assert.equal(native.headers.get("location"), sentLocation);
});

test("refuses cross-site posts", async (t) => {
  const base = await listen(t, { saveIntake: () => assert.fail("Nothing should be stored") });
  const other = await multipart(base, fields, { Origin: "https://another.example.test" });
  assert.equal(other.status, 403);
  assert.deepEqual(await other.json(), { ok: false, message: "Submit your request from the Tymo website." });
  assert.equal((await urlencoded(base, fields, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  const native = await urlencoded(base, fields, { Origin: "https://another.example.test", Accept: "text/html" });
  assert.equal(native.status, 303);
  assert.equal(native.headers.get("location"), errorLocation);
});

test("bounds attempts per client and supplies Retry-After", async (t) => {
  let saveCount = 0;
  const base = await listen(t, { saveIntake: async () => { saveCount += 1; return true; } });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await multipart(base)).status, 201);
  }
  const limited = await multipart(base);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.deepEqual(await limited.json(), { ok: false, message: "Too many requests. Please wait and try again." });
  assert.equal(saveCount, 10);
});

test("emails a retried request id once and records the email against the row", async (t) => {
  const rows = new Set();
  const emailed = [];
  const recorded = [];
  const store = {
    saveIntake: async (intake) => {
      if (rows.has(intake.id)) return false;
      rows.add(intake.id);
      return true;
    },
    recordEmail: async (id, record) => { recorded.push({ id, ...record }); },
  };
  const base = await listen(t, store, {
    notify: async (intake) => {
      emailed.push(intake);
      return { sent: true, to: ["team@example.test"] };
    },
  });

  assert.equal((await multipart(base, { ...fields, _request_id: requestId })).status, 201);
  await settle();
  assert.equal((await multipart(base, { ...fields, _request_id: requestId })).status, 201, "the retry is still confirmed");
  await settle();
  assert.equal(emailed.length, 1);
  assert.deepEqual(emailed[0], { id: requestId, ...saved });
  assert.deepEqual(recorded, [{ id: requestId, status: "sent", detail: null, to: "team@example.test" }]);

  // No inbox configured: still recorded, so the admin page can say why nothing was sent.
  const quiet = await listen(t, store, { notify: null });
  assert.equal((await urlencoded(quiet)).status, 201);
  await settle();
  assert.match(recorded[1].id, uuid);
  assert.deepEqual({ ...recorded[1], id: undefined }, { id: undefined, status: "not_sent", detail: "no_inbox", to: null });

  // A failing email never fails the request.
  const warn = t.mock.method(console, "warn", () => {});
  const broken = await listen(t, store, { notify: async () => { throw new Error("mail down"); } });
  assert.equal((await multipart(broken)).status, 201);
  await settle();
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[quotes] Could not record a request email's result."]]);
});

test("answers 503 when the database is missing or fails, in JSON and for native posts", async (t) => {
  const missing = await listen(t);
  const json = await multipart(missing);
  assert.equal(json.status, 503);
  assert.deepEqual(await json.json(), { ok: false, message: "Demo requests are temporarily unavailable. Please try again soon." });
  const native = await urlencoded(missing, fields, { Accept: "text/html" });
  assert.equal(native.status, 303);
  assert.equal(native.headers.get("location"), errorLocation);
  const invalidNative = await urlencoded(missing, { ...fields, email: "nope" }, { Accept: "text/html" });
  assert.equal(invalidNative.headers.get("location"), errorLocation);

  const warn = t.mock.method(console, "warn", () => {});
  const failing = await listen(t, { saveIntake: async () => { throw new Error("connection refused"); } }, {
    notify: () => assert.fail("Nothing should be emailed"),
  });
  assert.equal((await multipart(failing)).status, 503);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[quotes] Could not complete a demo request."]]);
});

test("renders the intake page with a retry id, the first-party action and native post states", async () => {
  const source = await readFile(new URL("../company-intake.html", import.meta.url));
  const formTag = '<form id="company-form" class="intake-form" action="/api/intake" method="post">';
  assert.ok(source.toString().includes(formTag), "company-intake.html posts to /api/intake");

  const plain = renderIntakePage(source, null).toString();
  const retryInput = new RegExp(`${formTag}<input type="hidden" name="_request_id" value="([\\da-f-]{36})">`);
  assert.match(plain, retryInput);
  assert.match(retryInput.exec(plain)[1], uuid);
  assert.notEqual(retryInput.exec(renderIntakePage(source, null).toString())[1], retryInput.exec(plain)[1]);
  assert.match(plain, /<div id="company-success" class="form-complete" hidden tabindex="-1">/);
  assert.match(plain, /<p class="intake-status" role="status" data-form-status hidden><\/p>/);
  assert.equal(plain.match(/name="_request_id"/g).length, 1);

  const sent = renderIntakePage(source, "sent").toString();
  assert.ok(sent.includes('<form id="company-form" class="intake-form" action="/api/intake" method="post" hidden>'));
  assert.ok(sent.includes('<div id="company-success" class="form-complete" tabindex="-1" autofocus><h2>Demo request received.</h2>'));

  const error = renderIntakePage(source, "error").toString();
  assert.ok(error.includes(formTag));
  assert.ok(error.includes(
    '<p class="intake-status" role="status" data-form-status tabindex="-1" autofocus>We couldn’t confirm your request. Please check your answers and try again.</p>',
  ));
  assert.match(error, /<div id="company-success" class="form-complete" hidden tabindex="-1">/);

  for (const state of ["<script>", "", "SENT"]) {
    const other = renderIntakePage(source, state).toString();
    assert.equal(other.replace(retryInput, ""), plain.replace(retryInput, ""), `state ${JSON.stringify(state)} changes nothing`);
  }
});

test("rewrites a Formspree action at serve time and leaves pages without the form untouched", () => {
  const formspree = Buffer.from(
    '<form id="company-form" class="intake-form" action="https://formspree.io/f/mjybgwdr" method="post"><input name="business"></form>',
  );
  assert.match(
    renderIntakePage(formspree, null).toString(),
    /^<form id="company-form" class="intake-form" action="\/api\/intake" method="post"><input type="hidden" name="_request_id" value="[\da-f-]{36}"><input name="business"><\/form>$/,
  );

  const noForm = Buffer.from("<main><p>No form here</p></main>");
  assert.equal(renderIntakePage(noForm, "sent"), noForm);
  const unclosed = Buffer.from('<form id="company-form" class="intake-form"');
  assert.equal(renderIntakePage(unclosed, null), unclosed);

  // A sent state without its success block keeps the form visible rather than showing nothing.
  const formOnly = Buffer.from('<form id="company-form" action="/api/intake"></form>');
  assert.ok(renderIntakePage(formOnly, "sent").toString().startsWith('<form id="company-form" action="/api/intake"><input type="hidden"'));

  const withId = Buffer.from('<form id="company-form"><input type="hidden" name="_request_id" value=""></form>');
  assert.equal(renderIntakePage(withId, null).toString().match(/name="_request_id"/g).length, 1);
});
