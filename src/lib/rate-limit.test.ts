import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../test/prisma-mock").then((m) => m.prismaModule()));

import { prisma as prismaClient } from "@/lib/prisma";
import { AUTH_RATE_LIMITS, clientIp, consumeRateLimit, limitAuthAttempt } from "./rate-limit";

const prisma = prismaClient as unknown as PrismaMock;
const now = new Date("2026-10-17T12:00:00Z");
const rule = { limit: 3, windowSec: 900 };

beforeEach(() => prisma.$reset());

describe("consumeRateLimit", () => {
  it("starts a fresh window when there is no live counter", async () => {
    prisma.rateLimit.updateMany.mockResolvedValue({ count: 0 });

    await expect(consumeRateLimit("login:ip:1.2.3.4", rule, now)).resolves.toEqual({ limited: false, retryAfterSec: 0 });
    expect(prisma.rateLimit.upsert).toHaveBeenCalledWith({
      where: { key: "login:ip:1.2.3.4" },
      create: { key: "login:ip:1.2.3.4", count: 1, resetAt: new Date("2026-10-17T12:15:00Z") },
      update: { count: 1, resetAt: new Date("2026-10-17T12:15:00Z") },
    });
  });

  it("allows up to the limit inside the window, then blocks with the time left", async () => {
    prisma.rateLimit.updateMany.mockResolvedValue({ count: 1 });
    prisma.rateLimit.findUnique.mockResolvedValueOnce({ count: 3, resetAt: new Date("2026-10-17T12:10:00Z") });
    await expect(consumeRateLimit("k", rule, now)).resolves.toEqual({ limited: false, retryAfterSec: 0 });

    prisma.rateLimit.findUnique.mockResolvedValueOnce({ count: 4, resetAt: new Date("2026-10-17T12:10:00Z") });
    await expect(consumeRateLimit("k", rule, now)).resolves.toEqual({ limited: true, retryAfterSec: 600 });
  });

  it("fails open when the database is unavailable", async () => {
    prisma.rateLimit.updateMany.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(consumeRateLimit("k", rule, now)).resolves.toEqual({ limited: false, retryAfterSec: 0 });
  });
});

describe("limitAuthAttempt", () => {
  it("counts sign-ins per account and per IP", async () => {
    prisma.rateLimit.updateMany.mockResolvedValue({ count: 0 });
    await limitAuthAttempt("login", { email: "Rahim@Example.com", ip: "1.2.3.4" });
    const keys = prisma.rateLimit.updateMany.mock.calls.map(([args]) => args.where.key).sort();
    expect(keys).toEqual(["login:account:rahim@example.com", "login:ip:1.2.3.4"]);
  });

  it("skips the IP bucket when the IP is unknown instead of sharing one bucket for everyone", async () => {
    prisma.rateLimit.updateMany.mockResolvedValue({ count: 0 });
    await limitAuthAttempt("register", { ip: null });
    expect(prisma.rateLimit.updateMany).not.toHaveBeenCalled();
  });

  it("keeps sign-in limits strict enough to stop guessing", () => {
    expect(AUTH_RATE_LIMITS.login.account.limit).toBeLessThanOrEqual(10);
  });
});

describe("clientIp", () => {
  it("takes the client from X-Forwarded-For, then X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(new Headers())).toBeNull();
  });
});
