import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The "server-only" package intentionally throws outside a real Next.js server request -
      // Vitest isn't one, so every file with `import "server-only"` would fail to even import.
      // This stub keeps the production guard in source untouched while letting pure functions in
      // those files still be unit-tested.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
