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
vi.mock("@/server/services/notification-service", () => ({ notify: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canModerateChat } from "@/lib/permissions";
import { getConversationParticipants, listConversationSummariesForUser, listMessages } from "./chat-service";

const prisma = prismaClient as unknown as PrismaMock;
const message = (n: number) => ({ id: `m${n}`, seq: n, content: `message ${n}` });

const canModerate = canModerateChat as unknown as ReturnType<typeof vi.fn>;
const removed = { id: "m2", content: "something abusive", deletedAt: new Date() };

beforeEach(() => {
  prisma.$reset();
  canModerate.mockResolvedValue(false);
});

describe("listMessages", () => {
  it("returns the newest page in display order, not the oldest", async () => {
    // The DB hands back newest-first: m60 ... m10 (limit + 1 rows means there's more).
    prisma.message.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => message(60 - i)));

    const result = await listMessages("student-1", "c1");

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { seq: "desc" }, take: 51 }));
    expect(result).toMatchObject({ ok: true, hasMore: true });
    const { messages } = result as { messages: { id: string }[] };
    expect(messages).toHaveLength(50);
    expect(messages[0].id).toBe("m11");
    expect(messages[49].id).toBe("m60");
  });

  it("pages back from the oldest seq the client has", async () => {
    prisma.message.findMany.mockResolvedValue([message(3), message(2), message(1)]);

    const result = await listMessages("student-1", "c1", { beforeSeq: 4 });

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "c1", seq: { lt: 4 } } })
    );
    expect(result).toMatchObject({ ok: true, hasMore: false, messages: [message(1), message(2), message(3)] });
  });
});

describe("removed messages", () => {
  it("blanks a removed message's text for regular participants", async () => {
    prisma.message.findMany.mockResolvedValue([removed, { ...message(1), deletedAt: null }]);

    const result = await listMessages("student-1", "c1");

    expect(result).toMatchObject({
      messages: [{ id: "m1", content: "message 1" }, { id: "m2", content: "", deletedAt: removed.deletedAt }],
    });
  });

  it("keeps the original text for chat moderators", async () => {
    canModerate.mockResolvedValue(true);
    prisma.message.findMany.mockResolvedValue([removed]);

    const result = await listMessages("support-1", "c1");

    expect(result).toMatchObject({ messages: [{ id: "m2", content: "something abusive" }] });
  });

  it("doesn't use a removed message as the conversation preview", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "c1",
        type: "COURSE_GROUP",
        course: { id: "course-1", title: "Intro to Web" },
        participants: [],
        messages: [{ ...removed, senderId: "student-2", createdAt: new Date() }],
      },
    ]);

    const [summary] = await listConversationSummariesForUser("student-1");

    expect(summary.lastMessage).toBe("Message removed");
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
