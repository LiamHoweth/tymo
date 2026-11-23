import { defineConfig } from "vitest/config";

const shared = { environment: "node" as const, testTimeout: 30_000, hookTimeout: 60_000, pool: "forks" as const };

// One project per area; each app resolves its own "@/" alias from its tsconfig.
export default defineConfig({
  test: {
    projects: [
      { test: { ...shared, name: "packages", include: ["packages/*/src/**/*.test.ts", "packages/*/tests/**/*.test.ts"] } },
      ...["company-web", "company-services", "tymo-services"].map((app) => ({
        root: `apps/${app}`,
        resolve: { tsconfigPaths: true },
        test: { ...shared, name: app, include: ["src/**/*.test.ts"] },
      })),
    ],
  },
});
