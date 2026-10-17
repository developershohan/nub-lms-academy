// Compiles the socket gateway and the worker to plain JavaScript for production (`node dist/...`)
// instead of running TypeScript through tsx. esbuild resolves the "@/..." path alias from
// tsconfig.json; npm packages stay external and load from node_modules at runtime.
import { build } from "esbuild";

const entries = {
  "socket-server/index": "socket-server/index.ts",
  "worker/index": "worker/index.ts",
};

await build({
  entryPoints: entries,
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
  // The generated Prisma client is ESM that reads its own location; give bundled code a require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
