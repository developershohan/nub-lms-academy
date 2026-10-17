import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  limitAuthAttempt: vi.fn(),
}));
vi.mock("@/lib/realtime", () => ({ disconnectUserSockets: vi.fn() }));

import { createHash } from "node:crypto";
import { prisma as prismaClient } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { limitAuthAttempt } from "@/lib/rate-limit";
import { disconnectUserSockets } from "@/lib/realtime";
import { registerUser, requestPasswordReset, resetPassword } from "./auth-service";

const prisma = prismaClient as unknown as PrismaMock;
const limit = limitAuthAttempt as unknown as ReturnType<typeof vi.fn>;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
  limit.mockResolvedValue({ limited: false, retryAfterSec: 0 });
  prisma.user.create.mockResolvedValue({ id: "user-1" });
  prisma.role.upsert.mockResolvedValue({ id: "role-student" });
});

describe("registerUser", () => {
  it("stores the email lowercased", async () => {
    await expect(registerUser({ name: "Rahim", email: "Rahim@Gmail.COM", password: "password123" })).resolves.toEqual({
      ok: true,
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "rahim@gmail.com" }),
    });
  });

  it("rejects an address already registered with different casing", async () => {
    // An older account stored before normalisation: the exact lowercase lookup misses it, the
    // case-insensitive fallback finds it.
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: "old-user", email: "Rahim@gmail.com" });
    const result = await registerUser({ name: "Rahim", email: "rahim@gmail.com", password: "password123" });
    expect(result).toEqual({ error: "An account with this email already exists" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  it("issues the reset token for the stored address, whatever casing was typed", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: "old-user", email: "Rahim@gmail.com", passwordHash: "x" });
    await requestPasswordReset("RAHIM@GMAIL.COM");
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ identifier: "Rahim@gmail.com" }),
    });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("Rahim@gmail.com", expect.any(String));
  });
});

describe("rate limits", () => {
  it("refuses sign-up from an IP over its limit", async () => {
    limit.mockResolvedValue({ limited: true, retryAfterSec: 1800 });
    const result = await registerUser({ name: "Rahim", email: "r@example.com", password: "password123" }, { ip: "1.2.3.4" });
    expect(result).toMatchObject({ error: expect.stringContaining("30 minutes"), rateLimited: true });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses a password-reset request over the limit without sending an email", async () => {
    limit.mockResolvedValue({ limited: true, retryAfterSec: 60 });
    await expect(requestPasswordReset("r@example.com")).resolves.toHaveProperty("error");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("hashed tokens", () => {
  it("stores only a SHA-256 of the token it emails", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "r@example.com", passwordHash: "x" });
    await requestPasswordReset("r@example.com");

    const resetUrl = new URL((sendPasswordResetEmail as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    const emailedToken = resetUrl.searchParams.get("token")!;
    const stored = prisma.verificationToken.create.mock.calls[0][0].data.token;
    expect(stored).toBe(sha256(emailedToken));
    expect(stored).not.toBe(emailedToken);
  });
});

describe("resetPassword", () => {
  it("looks the token up by hash, ends every session and drops all reset links", async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({ expires: new Date(Date.now() + 60_000) });
    prisma.user.update.mockReturnValue(Promise.resolve({ id: "user-1" }));
    prisma.verificationToken.deleteMany.mockReturnValue(Promise.resolve({ count: 2 }));

    await expect(
      resetPassword("r@example.com", { email: "r@example.com", token: "raw-token", password: "new-password" })
    ).resolves.toEqual({ ok: true });

    expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
      where: { identifier_token: { identifier: "r@example.com", token: sha256("raw-token") } },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "r@example.com" },
      data: { passwordHash: "hashed", sessionVersion: { increment: 1 } },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: "r@example.com" } });
    expect(disconnectUserSockets).toHaveBeenCalledWith("user-1");
  });
});
