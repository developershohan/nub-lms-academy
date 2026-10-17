import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canAccessCourse: vi.fn(), canManageCourse: vi.fn(), canModerateChat: vi.fn() }));
vi.mock("@/lib/realtime", () => ({
  emitRealtime: vi.fn(),
  realtimeBus: { emit: vi.fn(), disconnectUser: vi.fn(), removeUserFromRoom: vi.fn(), invalidateUser: vi.fn() },
}));
// Access rules have their own tests (access.ts via the integration suites); here everyone may read.
vi.mock("@/server/chat/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/chat/access")>()),
  getChatUser: vi.fn(async (id: string) => ({ id, name: null, roleNames: id.startsWith("support") ? ["SUPPORT"] : ["STUDENT"] })),
  resolveAccess: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/chat/membership", () => ({ reconcileCourseGroupsThrottled: vi.fn() }));
vi.mock("@/server/services/notification-service", () => ({ notify: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { getConversationParticipants, listConversationSummariesForUser, listMessages } from "./chat-service";

const prisma = prismaClient as unknown as PrismaMock;
const message = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `m${n}`,
  seq: n,
  conversationId: "c1",
  senderId: "student-2",
  clientMsgId: null,
  type: "TEXT",
  content: `message ${n}`,
  createdAt: new Date(2026, 9, 18, 10, n),
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  sender: { id: "student-2", name: "Rafi" },
  replyTo: null,
  reactions: [],
  ...extra,
});

const removed = message(2, { content: "something abusive", deletedAt: new Date(), deletedById: "support-1" });

beforeEach(() => prisma.$reset());

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
    expect(result).toMatchObject({ ok: true, hasMore: false, messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] });
  });
});

describe("removed messages", () => {
  it("blanks a removed message's text for regular participants and says a moderator did it", async () => {
    prisma.message.findMany.mockResolvedValue([removed, message(1)]);

    const result = await listMessages("student-1", "c1");

    expect(result).toMatchObject({
      messages: [
        { id: "m1", content: "message 1", removedByModerator: false },
        { id: "m2", content: "", deletedAt: removed.deletedAt, removedByModerator: true },
      ],
    });
  });

  it("keeps the original text for chat moderators", async () => {
    prisma.message.findMany.mockResolvedValue([removed]);

    const result = await listMessages("support-1", "c1");

    expect(result).toMatchObject({ messages: [{ id: "m2", content: "something abusive" }] });
  });

  it("doesn't use a removed message as the conversation preview", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "c1",
        type: "COURSE_GROUP",
        courseId: "course-1",
        channel: "GENERAL",
        title: null,
        announcementOnly: false,
        slowModeSec: 0,
        pinnedMessageId: null,
        lastSeq: 2,
        course: { id: "course-1", title: "Intro to Web" },
        participants: [{ userId: "student-1", role: "MEMBER", lastReadSeq: 1, mutedUntil: null, postingBlockedUntil: null, user: { id: "student-1", name: "Amina" } }],
        messages: [removed],
        supportTicket: null,
      },
    ]);

    const [summary] = await listConversationSummariesForUser("student-1");

    expect(summary).toMatchObject({ label: "Intro to Web", lastMessage: "Message removed", unread: 1, role: "MEMBER", canPost: true });
  });
});

describe("getConversationParticipants", () => {
  it("never selects participants' email addresses, and skips members who were removed", async () => {
    prisma.conversationParticipant.findMany.mockResolvedValue([]);
    await getConversationParticipants("student-1", "c1");
    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: "c1", removedAt: null },
        select: expect.objectContaining({ user: { select: { id: true, name: true } } }),
      })
    );
    expect(JSON.stringify(prisma.conversationParticipant.findMany.mock.calls[0][0])).not.toContain("email");
  });
});
