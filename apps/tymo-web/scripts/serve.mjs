import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteHandler, renderQuotePage } from "./quote-http.mjs";
import { openQuoteStore } from "./quote-store.mjs";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 3003);
const host = process.argv[3] ?? "0.0.0.0";
const databaseUrl = process.env.TYMO_LEADS_DATABASE_URL;
const quoteStore = databaseUrl ? openQuoteStore(databaseUrl) : null;
const handleQuote = createQuoteHandler(quoteStore, Boolean(process.env.RAILWAY_ENVIRONMENT_ID));
const publicPages = new Set([
  "/index.html", "/fonts.css", "/style.css", "/hero.css", "/product.css", "/lower.css",
  "/hero.js", "/product.js", "/demo.js", "/strip.js",
  "/assets/barlowcondensed-LICENSE.txt", "/assets/dmsans-LICENSE.txt",
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000, connectionsCheckingInterval: 5_000 }, async (req, res) => {
  const target = req.url ?? "/";
  const queryStart = target.indexOf("?");
  let pathname;
  try {
    pathname = decodeURIComponent(queryStart === -1 ? target : target.slice(0, queryStart));
  } catch {
    res.writeHead(400).end("Invalid path");
    return;
  }
  if (pathname === "/api/quote" || pathname === "/api/health") {
    await handleQuote(req, res, pathname);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  const isPublicAsset = /^\/assets\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(jpg|ttf)$/.test(pathname);
  if (!publicPages.has(pathname) && !isPublicAsset) {
    res.writeHead(404).end("Not found");
    return;
  }

  const file = join(root, pathname);
  try {
    if (await realpath(file) !== file) {
      res.writeHead(404).end("Not found");
      return;
    }
    const source = await readFile(file);
    const isQuotePage = pathname === "/index.html";
    const state = isQuotePage && queryStart !== -1
      ? new URLSearchParams(target.slice(queryStart + 1)).get("quote")
      : null;
    const body = isQuotePage ? renderQuotePage(source, state) : source;
    res.writeHead(200, {
      "content-type": contentTypes[extname(file)],
      "content-length": body.length,
      "x-content-type-options": "nosniff",
      ...(isQuotePage ? { "cache-control": "no-store" } : {}),
    }).end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

quoteStore?.initialize().catch(() => console.warn("[quotes] Quote database initialization will be retried."));
server.listen(port, host, () => console.log(`Tymo website listening on ${host}:${server.address().port}`));
