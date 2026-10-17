import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("../chat-store", () => ({
  accessFor: vi.fn(),
  persistMessage: vi.fn(),
  markChatRead: vi.fn(),
  listMessagesAfter: vi.fn(),
  editChatMessage: vi.fn(),
  removeChatMessage: vi.fn(),
  toggleReaction: vi.fn(),
  latestPreview: vi.fn(),
  memberIds: vi.fn(),
}));
vi.mock("@/server/chat/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/chat/messages")>()),
  notifyAboutMessage: vi.fn(),
}));

import { prisma as prismaClient } from "@/lib/prisma";
import { notifyAboutMessage } from "@/server/chat/messages";
import { createMemoryPresence } from "@/server/realtime/presence";
import type { RateLimiter } from "@/server/realtime/rate-limit";
import { listMessagesAfter, persistMessage } from "../chat-store";
import type { GatewayContext, GatewaySocket } from "../context";
import { registerChatEvents } from "./chat.events";

const prisma = prismaClient as unknown as PrismaMock;
const persist = persistMessage as unknown as ReturnType<typeof vi.fn>;
const messagesAfter = listMessagesAfter as unknown as ReturnType<typeof vi.fn>;

type Emitted = { target: string; event: string; payload: unknown };
type Handler = (...args: unknown[]) => Promise<void> | void;

const user = { id: "student-1", roleNames: ["STUDENT" as const], name: "Amina" };
const allowed = {
  ok: true as const,
  conversation: { id: "c1", type: "DIRECT" as const, courseId: null, channel: null, lastSeq: 8, slowModeSec: 0 },
  role: "MEMBER" as const,
  isParticipant: true,
  lastReadSeq: 5,
  mutedUntil: null,
  canPost: true,
  postingBlockedReason: null,
  canModerate: false,
  blocked: "none" as const,
  otherUserId: "teacher-1",
};

/** Minimal in-memory stand-ins for the socket server's context and one connected socket. */
function setup({ rateLimited = false, access = allowed as object }: { rateLimited?: boolean; access?: object } = {}) {
  const emitted: Emitted[] = [];
  const handlers = new Map<string, Handler>();
  const rooms = new Set<string>(["socket-1"]);
  const record = (target: string) => (event: string, payload: unknown) => emitted.push({ target, event, payload });
  const socket = {
    id: "socket-1",
    data: { user, viewing: null, typingAt: {} },
    rooms,
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    join: (room: string) => rooms.add(room),
    leave: (room: string) => rooms.delete(room),
    emit: record("self"),
    to: (room: string) => ({ emit: record(`others:${room}`) }),
    disconnect: vi.fn(),
  };
  const io = { to: (room: string) => ({ emit: record(room) }), of: () => ({ sockets: new Map() }) };
  const limiter: RateLimiter = { take: vi.fn().mockResolvedValue({ allowed: !rateLimited, retryAfterMs: rateLimited ? 1000 : 0 }) };
  const ctx = {
    io,
    presence: createMemoryPresence(),
    limiter,
    access: { get: vi.fn().mockResolvedValue(access) },
    users: { fresh: vi.fn().mockResolvedValue(user) },
    queue: null,
    invalidate: vi.fn(),
  } as unknown as GatewayContext;
  registerChatEvents(ctx, socket as unknown as GatewaySocket);
  return { emitted, handlers, rooms, ctx };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$reset();
});

const saved = {
  id: "m9",
  seq: 9,
  conversationId: "c1",
  senderId: "student-1",
  content: "hi",
  deletedAt: null,
  createdAt: new Date(),
  sender: { id: "student-1", name: "Amina" },
  reactions: [],
  replyTo: null,
};
const sent = { ok: true, message: saved, duplicate: false, recipients: [{ userId: "teacher-1", unread: 3 }], conversation: { type: "DIRECT" }, ticket: null, ticketEvent: null };

describe("chat socket events", () => {
  it("acks an error instead of leaving an unhandled rejection when the database fails", async () => {
    const { handlers } = setup();
    persist.mockRejectedValue(new Error("connection terminated"));
    const ack = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(handlers.get("message:send")!({ conversationId: "c1", content: "hi" }, ack)).resolves.toBeUndefined();

    expect(ack).toHaveBeenCalledWith({ error: expect.any(String) });
  });

  it("refuses a send past the user's rate limit before touching the database", async () => {
    const { handlers } = setup({ rateLimited: true });
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi" }, ack);

    expect(ack).toHaveBeenCalledWith({ error: expect.stringMatching(/too fast/) });
    expect(persist).not.toHaveBeenCalled();
  });

  it("refuses to post where the user may only read, with the reason", async () => {
    const { handlers } = setup({ access: { ...allowed, canPost: false, postingBlockedReason: "Only instructors post in #announcements." } });
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi" }, ack);

    expect(ack).toHaveBeenCalledWith({ error: "Only instructors post in #announcements." });
    expect(persist).not.toHaveBeenCalled();
  });

  it("joins the room, announces to it, and reports who is online from the presence keys", async () => {
    const { handlers, emitted, rooms, ctx } = setup();
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: "teacher-1" }, { userId: "student-2" }]);
    await ctx.presence.touchOnline(["teacher-1"]);
    const ack = vi.fn();

    await handlers.get("conversation:join")!("c1", ack);

    expect(rooms.has("conversation:c1")).toBe(true);
    expect(emitted).toContainEqual({ target: "others:conversation:c1", event: "user:online", payload: { userId: "student-1" } });
    expect(emitted).toContainEqual({ target: "self", event: "user:online", payload: { userId: "teacher-1" } });
    expect(emitted.some((e) => e.payload && (e.payload as { userId?: string }).userId === "student-2")).toBe(false);
    expect(ack).toHaveBeenCalledWith({ online: ["teacher-1"], lastSeq: 8, lastReadSeq: 5 });
  });

  it("relays typing only into conversations the socket has joined, at most every 2 seconds", () => {
    const { handlers, emitted, rooms } = setup();
    rooms.add("conversation:mine");

    handlers.get("typing:start")!("someone-elses");
    handlers.get("typing:start")!("mine");
    handlers.get("typing:start")!("mine");
    handlers.get("typing:stop")!("mine");

    expect(emitted).toEqual([
      { target: "others:conversation:mine", event: "typing:start", payload: { conversationId: "mine", userId: "student-1", name: "Amina" } },
      { target: "others:conversation:mine", event: "typing:stop", payload: { conversationId: "mine", userId: "student-1" } },
    ]);
  });

  it("acks the saved message, and tells each member's inbox their unread count", async () => {
    const { handlers, emitted } = setup();
    persist.mockResolvedValue(sent);
    prisma.conversationParticipant.findMany.mockResolvedValue([]);
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi", clientMsgId: "tmp-1" }, ack);

    expect(persist).toHaveBeenCalledWith("c1", "student-1", "hi", "tmp-1", undefined);
    expect(ack).toHaveBeenCalledWith({ message: saved });
    expect(emitted).toContainEqual({ target: "conversation:c1", event: "message:new", payload: saved });
    expect(emitted).toContainEqual(
      expect.objectContaining({ target: "user:teacher-1", event: "conversation:updated", payload: expect.objectContaining({ unread: 3, lastSeq: 9 }) })
    );
    // Notified, minus whoever has the conversation on screen.
    expect(notifyAboutMessage).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ message: saved }), { viewing: expect.any(Set) });
  });

  it("skips the notification for a member who has the conversation on screen on any node", async () => {
    const { handlers, ctx } = setup();
    persist.mockResolvedValue(sent);
    await ctx.presence.touchViewing([{ userId: "teacher-1", conversationId: "c1" }]);

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi" }, vi.fn());

    const viewing = (notifyAboutMessage as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2].viewing as Set<string>;
    expect([...viewing]).toEqual(["teacher-1"]);
  });

  it("acks a retried send with the original message without broadcasting it again", async () => {
    const { handlers, emitted } = setup();
    persist.mockResolvedValue({ ...sent, duplicate: true, recipients: [] });
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi", clientMsgId: "tmp-1" }, ack);

    expect(ack).toHaveBeenCalledWith({ message: saved });
    expect(emitted).toEqual([]);
    expect(notifyAboutMessage).not.toHaveBeenCalled();
  });

  it("answers a reconnect sync with the gap and recent changes, only for conversations the user can open", async () => {
    const { handlers, rooms } = setup({ access: { ok: false, reason: "forbidden" } });
    const ack = vi.fn();
    await handlers.get("sync")!({ conversationId: "c1", lastSeq: 8 }, ack);
    expect(ack).toHaveBeenLastCalledWith({ error: "Forbidden" });

    const ok = setup();
    messagesAfter.mockResolvedValue({ messages: [saved], changed: [], reset: false });
    await ok.handlers.get("sync")!({ conversationId: "c1", lastSeq: 8, since: "2026-10-18T10:00:00.000Z" }, ack);
    expect(messagesAfter).toHaveBeenCalledWith("c1", 8, { moderator: false, since: new Date("2026-10-18T10:00:00.000Z") });
    expect(ack).toHaveBeenLastCalledWith({ messages: [saved], changed: [], reset: false, lastSeq: 9, lastReadSeq: 5 });
    expect(ok.rooms.has("conversation:c1")).toBe(true);
    void rooms;
  });

  it("only reveals presence of people who share a conversation with the caller", async () => {
    const { handlers, ctx } = setup();
    await ctx.presence.touchOnline(["friend", "stranger"]);
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: "friend" }]);
    const ack = vi.fn();

    await handlers.get("presence:query")!(["friend", "stranger"], ack);

    expect(ack).toHaveBeenCalledWith({ online: ["friend"] });
  });
});
