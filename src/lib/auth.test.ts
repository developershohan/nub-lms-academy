import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  limitAuthAttempt: vi.fn().mockResolvedValue({ limited: false, retryAfterSec: 0 }),
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn().mockResolvedValue(true) } }));
// next-auth itself can't load under Vitest (it imports "next/server" without an extension); the
// functions under test only need CredentialsSignin, so stub the library and its providers.
vi.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return {
    default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
    CredentialsSignin,
  };
});
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }));
vi.mock("next-auth/providers/google", () => ({ default: () => ({}) }));
vi.mock("next-auth/providers/github", () => ({ default: () => ({}) }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));

import { prisma as prismaClient } from "@/lib/prisma";
import { limitAuthAttempt } from "@/lib/rate-limit";
import { RateLimitedError, authorizeCredentials, revalidateSessionToken } from "./auth";
import type { JWT } from "next-auth/jwt";

const prisma = prismaClient as unknown as PrismaMock;
const limit = limitAuthAttempt as unknown as ReturnType<typeof vi.fn>;
const request = () => new Request("http://localhost/api/auth/callback/credentials", { headers: { "x-forwarded-for": "198.51.100.4" } });
const token = (extra: Partial<JWT> = {}) => ({ id: "user-1", status: "ACTIVE", roles: ["STUDENT"], ...extra }) as JWT;

beforeEach(() => {
  prisma.$reset();
  limit.mockResolvedValue({ limited: false, retryAfterSec: 0 });
});

describe("authorizeCredentials", () => {
  it("refuses before touching the user or bcrypt once the account or IP is rate limited", async () => {
    limit.mockResolvedValue({ limited: true, retryAfterSec: 600 });

    await expect(authorizeCredentials({ email: "a@example.com", password: "x" }, request())).rejects.toBeInstanceOf(
      RateLimitedError
    );
    expect(limit).toHaveBeenCalledWith("login", { email: "a@example.com", ip: "198.51.100.4" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("still signs in a verified, active user under the limit", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      name: "A",
      image: null,
      status: "ACTIVE",
      passwordHash: "hash",
      emailVerified: new Date(),
    });
    await expect(authorizeCredentials({ email: "a@example.com", password: "x" }, request())).resolves.toMatchObject({
      id: "user-1",
    });
  });
});

describe("revalidateSessionToken", () => {
  it("ends the session once the account is banned", async () => {
    prisma.user.findUnique.mockResolvedValue({ status: "BANNED", sessionVersion: 1 });
    await expect(revalidateSessionToken(token({ sessionVersion: 0 }))).resolves.toBeNull();
  });

  it("ends the session after a password change or reset bumped the version", async () => {
    prisma.user.findUnique.mockResolvedValue({ status: "ACTIVE", sessionVersion: 3 });
    await expect(revalidateSessionToken(token({ sessionVersion: 2 }))).resolves.toBeNull();
  });

  it("keeps a current session, including one issued before versions existed", async () => {
    prisma.user.findUnique.mockResolvedValue({ status: "ACTIVE", sessionVersion: 0 });
    await expect(revalidateSessionToken(token())).resolves.toMatchObject({ id: "user-1" });
  });

  it("keeps the session through a database error rather than signing everyone out", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revalidateSessionToken(token({ sessionVersion: 1 }))).resolves.toMatchObject({ id: "user-1" });
  });
});
