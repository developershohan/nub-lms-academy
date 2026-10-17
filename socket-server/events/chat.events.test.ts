import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";

vi.mock("../chat-store", () => ({
  canAccessConversation: vi.fn(),
  persistMessage: vi.fn(),
  markChatRead: vi.fn(),
  listMessagesAfter: vi.fn(),
}));

vi.mock("@/server/chat/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/chat/messages")>()),
  notifyAboutMessage: vi.fn(),
}));

import { notifyAboutMessage } from "@/server/chat/messages";
import { canAccessConversation, listMessagesAfter, persistMessage } from "../chat-store";
import { registerChatEvents } from "./chat.events";

const canAccess = canAccessConversation as unknown as ReturnType<typeof vi.fn>;
const persist = persistMessage as unknown as ReturnType<typeof vi.fn>;
const messagesAfter = listMessagesAfter as unknown as ReturnType<typeof vi.fn>;

type Emitted = { target: string; event: string; payload: unknown };
type Handler = (...args: unknown[]) => Promise<void> | void;

/** Minimal in-memory stand-ins for Socket.IO's server and one connected socket. */
function setup(otherSocketsInRoom: { id: string; userId: string }[] = []) {
  const emitted: Emitted[] = [];
  const handlers = new Map<string, Handler>();
  const rooms = new Set<string>(["socket-1"]);
  const record = (target: string) => (event: string, payload: unknown) => emitted.push({ target, event, payload });
  const socket = {
    id: "socket-1",
    data: { user: { id: "student-1", roleNames: ["STUDENT"], name: "Amina" } },
    rooms,
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    join: (room: string) => rooms.add(room),
    leave: (room: string) => rooms.delete(room),
    emit: record("self"),
    to: (room: string) => ({ emit: record(`others:${room}`) }),
  };
  const io = {
    emit: record("everyone"),
    to: (room: string) => ({ emit: record(room) }),
    in: (room: string) => ({
      fetchSockets: async () => [
        ...(rooms.has(room) ? [{ id: socket.id, data: socket.data }] : []),
        ...otherSocketsInRoom.map((s) => ({ id: s.id, data: { user: { id: s.userId } } })),
      ],
    }),
  };
  registerChatEvents(io as unknown as Server, socket as unknown as Socket);
  return { emitted, handlers, rooms };
}

beforeEach(() => vi.clearAllMocks());

describe("chat socket events", () => {
  it("acks an error instead of leaving an unhandled rejection when the database fails", async () => {
    const { handlers } = setup();
    canAccess.mockRejectedValue(new Error("connection terminated"));
    const ack = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(handlers.get("message:send")!({ conversationId: "c1", content: "hi" }, ack)).resolves.toBeUndefined();

    expect(ack).toHaveBeenCalledWith({ error: expect.any(String) });
    expect(persist).not.toHaveBeenCalled();
  });

  it("scopes presence to the conversation room instead of broadcasting to everyone", async () => {
    const { handlers, emitted } = setup([{ id: "socket-2", userId: "teacher-1" }]);
    canAccess.mockResolvedValue(true);

    await handlers.get("conversation:join")!("c1", vi.fn());

    expect(emitted.some((e) => e.target === "everyone")).toBe(false);
    expect(emitted).toContainEqual({
      target: "others:conversation:c1",
      event: "user:online",
      payload: { userId: "student-1" },
    });
    // ...and the joiner learns who is already in the room.
    expect(emitted).toContainEqual({ target: "self", event: "user:online", payload: { userId: "teacher-1" } });
  });

  it("relays typing only into conversations the socket has joined", async () => {
    const { handlers, emitted, rooms } = setup();
    rooms.add("conversation:mine");

    await handlers.get("typing:start")!("someone-elses");
    await handlers.get("typing:start")!("mine");

    expect(emitted).toEqual([
      {
        target: "others:conversation:mine",
        event: "typing:start",
        payload: { conversationId: "mine", userId: "student-1", name: "Amina" },
      },
    ]);
  });

  it("announces offline to the room on disconnect only when no other tab of the user remains", async () => {
    const { handlers, emitted, rooms } = setup();
    rooms.add("conversation:c1");

    await handlers.get("disconnecting")!();

    expect(emitted).toEqual([{ target: "conversation:c1", event: "user:offline", payload: { userId: "student-1" } }]);
  });

  const saved = { id: "m9", seq: 9, conversationId: "c1", senderId: "student-1", content: "hi", deletedAt: null, createdAt: new Date() };

  it("acks the saved message, and tells each member's inbox their unread count", async () => {
    const { handlers, emitted } = setup();
    canAccess.mockResolvedValue(true);
    persist.mockResolvedValue({ ok: true, message: saved, duplicate: false, recipients: [{ userId: "teacher-1", unread: 3 }] });
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi", clientMsgId: "tmp-1" }, ack);

    expect(persist).toHaveBeenCalledWith("c1", "student-1", "hi", "tmp-1");
    expect(ack).toHaveBeenCalledWith({ message: saved });
    expect(emitted).toContainEqual({ target: "conversation:c1", event: "message:new", payload: saved });
    expect(emitted).toContainEqual(
      expect.objectContaining({ target: "user:teacher-1", event: "conversation:updated", payload: expect.objectContaining({ unread: 3, lastSeq: 9 }) })
    );
    // Notified, minus whoever already has the conversation open.
    expect(notifyAboutMessage).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ message: saved }), {
      viewing: expect.any(Set),
    });
  });

  it("acks a retried send with the original message without broadcasting it again", async () => {
    const { handlers, emitted } = setup();
    canAccess.mockResolvedValue(true);
    persist.mockResolvedValue({ ok: true, message: saved, duplicate: true, recipients: [] });
    const ack = vi.fn();

    await handlers.get("message:send")!({ conversationId: "c1", content: "hi", clientMsgId: "tmp-1" }, ack);

    expect(ack).toHaveBeenCalledWith({ message: saved });
    expect(emitted).toEqual([]);
    expect(notifyAboutMessage).not.toHaveBeenCalled();
  });

  it("answers a reconnect sync with the gap, only for conversations the user can open", async () => {
    const { handlers } = setup();
    messagesAfter.mockResolvedValue({ messages: [saved], reset: false });
    const ack = vi.fn();

    canAccess.mockResolvedValue(false);
    await handlers.get("sync")!({ conversationId: "c1", lastSeq: 8 }, ack);
    expect(ack).toHaveBeenLastCalledWith({ error: "Forbidden" });

    canAccess.mockResolvedValue(true);
    await handlers.get("sync")!({ conversationId: "c1", lastSeq: 8 }, ack);
    expect(messagesAfter).toHaveBeenCalledWith("c1", 8, { moderator: false });
    expect(ack).toHaveBeenLastCalledWith({ messages: [saved], reset: false });
  });
});
