import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));

import { prisma as prismaClient } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { registerUser, requestPasswordReset } from "./auth-service";

const prisma = prismaClient as unknown as PrismaMock;

beforeEach(() => {
  prisma.$reset();
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
