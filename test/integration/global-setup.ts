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
    /** Null when no Redis could be found or started: the real-time suites skip themselves. */
    redisUrl: string | null;
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
 * Redis for the real-time suites: TEST_REDIS_URL (CI's service container, or your own), else a
 * throwaway redis-memory-server (Memurai on Windows, redis-server elsewhere - downloaded once into
 * node_modules/.cache). The suites flush it, so never point TEST_REDIS_URL at a Redis you need.
 */
async function startRedis(): Promise<{ url: string; stop: () => Promise<void> }> {
  const configured = process.env.TEST_REDIS_URL;
  if (configured) return { url: configured, stop: async () => {} };
  const { RedisMemoryServer } = await import("redis-memory-server");
  const server = new RedisMemoryServer();
  const url = `redis://${await server.getHost()}:${await server.getPort()}`;
  return {
    url,
    stop: async () => {
      await server.stop();
    },
  };
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

  let redis: { url: string; stop: () => Promise<void> } | null = null;
  try {
    redis = await startRedis();
  } catch (err) {
    console.warn("[integration] No Redis available - the real-time suites will be skipped:", err instanceof Error ? err.message : err);
  }
  project.provide("redisUrl", redis?.url ?? null);

  return async () => {
    await redis?.stop();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
