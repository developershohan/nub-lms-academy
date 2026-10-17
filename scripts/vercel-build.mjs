// Vercel runs `npm run vercel-build` in place of `npm run build`. Production deploys apply pending
// migrations before building, so a merged PR that adds a migration can't ship code that queries
// columns the database doesn't have yet. Preview and development builds never migrate - they may
// share the production database.
import { execSync } from "node:child_process";

function run(command) {
  console.log(`> ${command}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
}

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv === "production") {
  if (!process.env.DIRECT_URL) {
    console.warn(
      "DIRECT_URL is not set - migrating over DATABASE_URL. Set DIRECT_URL to Neon's direct (non-pooled) endpoint.",
    );
  }
  run("prisma migrate deploy");
} else {
  console.log(`Skipping prisma migrate deploy (VERCEL_ENV=${vercelEnv ?? "unset"}).`);
}

run("next build");
