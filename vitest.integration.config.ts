import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests: real services against a real PostgreSQL (embedded-postgres, started by
 * test/integration/global-setup.ts with the repo's migrations applied). Run with
 * `npm run test:integration`; `npm run test:run` stays DB-free and fast.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    setupFiles: ["test/integration/setup.ts"],
    // One database for the whole run: files run one at a time and reset it between tests.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
