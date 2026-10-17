import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  canAccessConversation: vi.fn().mockResolvedValue(true),
  canAccessCourse: vi.fn(),
  canManageCourse: vi.fn(),
  canModerateChat: vi.fn(),
}));
vi.mock("@/server/services/notification-service", () => ({ createNotifications: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { getConversationParticipants, listMessages } from "./chat-service";

const prisma = prismaClient as unknown as PrismaMock;
const message = (n: number) => ({ id: `m${n}`, content: `message ${n}` });

beforeEach(() => prisma.$reset());

describe("listMessages", () => {
  it("returns the newest page in display order, not the oldest", async () => {
    // The DB hands back newest-first: m60 ... m10 (limit + 1 rows means there's more).
    prisma.message.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => message(60 - i)));

    const result = await listMessages("student-1", "c1");

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 })
    );
    expect(result).toMatchObject({ ok: true, hasMore: true });
    const { messages } = result as { messages: { id: string }[] };
    expect(messages).toHaveLength(50);
    expect(messages[0].id).toBe("m11");
    expect(messages[49].id).toBe("m60");
  });

  it("pages back from a `before` cursor", async () => {
    prisma.message.findMany.mockResolvedValue([message(3), message(2), message(1)]);

    const result = await listMessages("student-1", "c1", { before: "m4" });

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "m4" }, skip: 1 }));
    expect(result).toMatchObject({ ok: true, hasMore: false, messages: [message(1), message(2), message(3)] });
  });
});

describe("getConversationParticipants", () => {
  it("never selects participants' email addresses", async () => {
    prisma.conversationParticipant.findMany.mockResolvedValue([]);
    await getConversationParticipants("student-1", "c1");
    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      include: { user: { select: { id: true, name: true } } },
    });
  });
});
