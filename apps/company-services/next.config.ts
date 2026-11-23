import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@tymo/ui", "@tymo/shared", "@tymo/db", "@tymo/company", "@tymo/platform"],
  // PGlite ships WASM + data files; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-socket"],
  turbopack: {
    // Monorepo root, so packages/ and the hoisted node_modules resolve.
    root: path.join(process.cwd(), "..", ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
