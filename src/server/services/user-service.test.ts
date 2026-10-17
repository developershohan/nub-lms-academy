import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canAdminAccess: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ disconnectUserSockets: vi.fn() }));
vi.mock("@/server/services/auth-service", () => ({ sendEmailVerification: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue("new-hash") },
}));

import { prisma as prismaClient } from "@/lib/prisma";
import { disconnectUserSockets } from "@/lib/realtime";
import { banUser, changePassword } from "./user-service";

const prisma = prismaClient as unknown as PrismaMock;

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
});

describe("banUser", () => {
  it("ends the banned user's sessions and drops their live sockets", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "student-1", roles: [{ role: { name: "STUDENT" } }] });

    await expect(banUser("admin-1", "student-1", "spam")).resolves.toEqual({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { status: "BANNED", sessionVersion: { increment: 1 } },
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith("student-1");
  });
});

describe("changePassword", () => {
  it("ends every existing session, so whoever knew the old password is signed out", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "student-1", passwordHash: "old-hash" });

    await expect(changePassword("student-1", "old-password", "new-password")).resolves.toEqual({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { passwordHash: "new-hash", sessionVersion: { increment: 1 } },
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith("student-1");
  });
});
