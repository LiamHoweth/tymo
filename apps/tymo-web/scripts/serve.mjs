import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 3003);
const host = process.argv[3] ?? "0.0.0.0";
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

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split("?", 1)[0]);
  } catch {
    res.writeHead(400).end("Invalid path");
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
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": contentTypes[extname(file)],
      "content-length": body.length,
      "x-content-type-options": "nosniff",
    }).end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, host, () => console.log(`Tymo website listening on ${host}:${server.address().port}`));
