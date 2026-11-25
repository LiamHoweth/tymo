import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** Starts serve.mjs on a free port without a database or email settings. */
async function startSite(t) {
  const env = { ...process.env, NODE_ENV: "development" };
  for (const name of [
    "TYMO_LEADS_DATABASE_URL", "RAILWAY_ENVIRONMENT_ID", "TYMO_ADMIN_USER", "TYMO_ADMIN_PASSWORD", "SESSION_SECRET",
    "TYMO_QUOTE_NOTIFY_TO", "RESEND_API_KEY",
  ]) {
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
  return `http://127.0.0.1:${port}`;
}

const get = (base, path, init = {}) => fetch(`${base}${path}`, { redirect: "manual", ...init });

test("serves the redesigned pages, styles, photos and font license", async (t) => {
  const base = await startSite(t);
  for (const [path, type] of [
    ["/", "text/html; charset=utf-8"],
    ["/company-intake.html", "text/html; charset=utf-8"],
    ["/faq.html", "text/html; charset=utf-8"],
    ["/pages.css", "text/css; charset=utf-8"],
    ["/demo.js", "text/javascript; charset=utf-8"],
    ["/assets/desk-sport.webp", "image/webp"],
    ["/assets/desk-venue.webp", "image/webp"],
    ["/assets/chivo-bold-italic.ttf", "font/ttf"],
    ["/assets/chivo-LICENSE.txt", "text/plain; charset=utf-8"],
  ]) {
    const response = await get(base, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), type, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  assert.equal((await get(base, "/faq.html")).headers.get("cache-control"), null, "static pages stay cacheable");
  assert.equal((await get(base, "/assets/missing.webp")).status, 404);
  assert.equal((await get(base, "/assets/desk-sport.WEBP")).status, 404);
  assert.equal((await get(base, "/package.json")).status, 404);
  assert.equal((await get(base, "/scripts/serve.mjs")).status, 404);
});

test("every file the site pages and styles reference is served", async (t) => {
  const base = await startSite(t);
  const site = new URL("../", import.meta.url);
  const references = new Set();
  for (const page of ["index.html", "company-intake.html", "faq.html"]) {
    const html = await readFile(new URL(page, site), "utf8");
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      if (!/^(?:https?:|mailto:|tel:)/.test(ref)) references.add(new URL(ref, `http://site.test/${page}`).pathname);
    }
  }
  for (const sheet of ["fonts.css", "style.css", "hero.css", "product.css", "lower.css", "pages.css"]) {
    const css = await readFile(new URL(sheet, site), "utf8");
    for (const [, ref] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!ref.startsWith("data:")) references.add(new URL(ref, `http://site.test/${sheet}`).pathname);
    }
  }
  assert.ok(references.size > 20, "found the site's references");
  for (const path of references) {
    assert.equal((await get(base, path)).status, 200, path);
  }
});

test("redirects the short paths", async (t) => {
  const base = await startSite(t);
  for (const [path, location] of [
    ["/faq", "/faq.html"],
    ["/company-intake", "/company-intake.html"],
    ["/demo", "/company-intake.html"],
    ["/demo?ref=card", "/company-intake.html?ref=card"],
  ]) {
    const response = await get(base, path);
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.get("location"), location, path);
  }
  assert.equal((await get(base, "/faq", { method: "HEAD" })).status, 301);
  assert.equal((await get(base, "/faq", { method: "POST" })).status, 405);
  assert.equal((await get(base, "/faq/")).status, 404);
});

test("serves the intake page posting to /api/intake with a retry id and native post states", async (t) => {
  const base = await startSite(t);
  const page = await get(base, "/company-intake.html");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  assert.ok(html.includes('<form id="company-form" class="intake-form" action="/api/intake" method="post"><input type="hidden" name="_request_id" value="'));
  assert.match(html, /name="_request_id" value="[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}"/);
  assert.ok(!html.includes("formspree"));
  assert.match(html, /<div id="company-success" class="form-complete" hidden tabindex="-1">/);
  const again = await (await get(base, "/company-intake.html")).text();
  assert.notEqual(again, html, "each load gets its own retry id");

  const sent = await (await get(base, "/company-intake.html?intake=sent")).text();
  assert.match(sent, /<form id="company-form" class="intake-form" action="\/api\/intake" method="post" hidden>/);
  assert.match(sent, /<div id="company-success" class="form-complete" tabindex="-1" autofocus><h2>Demo request received\.<\/h2>/);

  const error = await (await get(base, "/company-intake.html?intake=error")).text();
  assert.match(error, /data-form-status tabindex="-1" autofocus>We couldn’t confirm your request\. Please check your answers and try again\.<\/p>/);

  const head = await get(base, "/company-intake.html", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("routes /api/intake and keeps /api/quote and /api/health", async (t) => {
  const base = await startSite(t);
  const body = new FormData();
  for (const [key, value] of Object.entries({
    business: "Example Fieldhouse", name: "Avery Tester", email: "avery@example.test",
    offerings: "Two fields", booking_workflow: "Email",
  })) {
    body.append(key, value);
  }
  const intake = await get(base, "/api/intake", { method: "POST", body, headers: { Accept: "application/json" } });
  assert.equal(intake.status, 503, "no database configured");
  assert.deepEqual(await intake.json(), { ok: false, message: "Demo requests are temporarily unavailable. Please try again soon." });
  assert.equal((await get(base, "/api/intake")).status, 405);

  const quote = await get(base, "/api/quote", {
    method: "POST",
    body: new URLSearchParams({ name: "Avery Tester", business: "Example Rink", business_type: "Sports facility", email: "avery@example.test" }),
    headers: { Accept: "application/json" },
  });
  assert.equal(quote.status, 503);
  assert.equal((await get(base, "/api/health")).status, 503);
});
