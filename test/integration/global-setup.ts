import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Starts a throwaway PostgreSQL for the integration run (no Docker or local install needed - the
 * binaries come from the embedded-postgres package), applies the real migrations with
 * `prisma migrate deploy`, and hands the URL to the test workers. Never points at a real database.
 */
export default async function setup(project: TestProject) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nub-lms-it-pg-"));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    // initdb otherwise takes the OS locale - WIN1252 on Windows, which can't store Bengali text.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (message) => console.error("[embedded-postgres]", message),
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("lms_integration");

  const databaseUrl = `postgresql://postgres:postgres@localhost:${port}/lms_integration`;
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    // prisma.config.ts prefers DIRECT_URL, so override both - otherwise a DIRECT_URL in .env would
    // send these migrations to a real database.
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: "pipe",
  });
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
