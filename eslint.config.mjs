import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Monorepo: the Next.js apps live under apps/.
    settings: { next: { rootDir: ["apps/company-web/", "apps/company-services/", "apps/tymo-services/"] } },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/node_modules/**",
    ".data/**",
    ".claude/**",
    // Static marketing site (plain browser JS, no React).
    "apps/tymo-web/**",
  ]),
]);

export default eslintConfig;
