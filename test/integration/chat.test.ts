import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { SYNC_LIMIT, listMessagesAfter, markChatRead, sendChatMessage } from "@/server/chat/messages";
import {
  getOrCreateCourseGroupConversation,
  listConversationSummariesForUser,
  sendMessage,
  startDirectConversation,
} from "@/server/services/chat-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(emitRealtime).mockClear();
});

/** A teacher and their enrolled student, who may message each other, and the DM between them. */
async function pair() {
  const teacher = await createUser(["TEACHER"]);
  const student = await createUser();
  const course = await createCourse(teacher.id);
  await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
  const started = await startDirectConversation(student.id, teacher.id);
  if (!started.ok) throw new Error(started.error);
  return { teacher, student, course, conversationId: started.conversationId };
}

const send = (conversationId: string, senderId: string, content: string, clientMsgId?: string) =>
  sendChatMessage({ conversationId, senderId, content, clientMsgId });

describe("sequence numbers", () => {
  it("numbers messages 1, 2, 3... per conversation, even when sent at once", async () => {
    const { teacher, student, conversationId } = await pair();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => send(conversationId, i % 2 ? teacher.id : student.id, `message ${i}`))
    );

    const seqs = (await prisma.message.findMany({ where: { conversationId }, orderBy: { seq: "asc" } })).map((m) => m.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({
      lastSeq: 10,
      lastMessageAt: expect.any(Date),
    });
  });

  it("posts a retried send once, returning the original to the retry", async () => {
    const { student, conversationId } = await pair();
    const [first, second] = await Promise.all([
      send(conversationId, student.id, "hello", "tab-1:42"),
      send(conversationId, student.id, "hello", "tab-1:42"),
    ]);
    const later = await send(conversationId, student.id, "hello", "tab-1:42");

    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    const ids = new Set([first, second, later].map((r) => (r.ok ? r.message.id : null)));
    expect(ids.size).toBe(1);
    expect(later).toMatchObject({ duplicate: true, recipients: [] });
    // The conversation's counter didn't move for the duplicates.
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({ lastSeq: 1 });
  });
});

describe("a retry racing the original on another server", () => {
  it("returns the message the other server saved when both insert the same clientMsgId", async () => {
    // The socket server and a REST retry can save the same send at once. Play the first on its own
    // connection: it has taken the next seq and inserted the message, but not committed. The retry
    // finds nothing yet, then hits the unique key once the first commits - and must hand back that
    // message rather than fail or post a second copy.
    const { student, conversationId } = await pair();
    const otherServer = new Client({ connectionString: process.env.DATABASE_URL });
    await otherServer.connect();
    await otherServer.query("BEGIN");
    await otherServer.query(`UPDATE "Conversation" SET "lastSeq" = "lastSeq" + 1 WHERE id = $1`, [conversationId]);
    await otherServer.query(
      `INSERT INTO "Message" (id, "conversationId", "senderId", seq, "clientMsgId", content) VALUES ('first', $1, $2, 1, 'tab-1:7', 'hello')`,
      [conversationId, student.id]
    );

    const retry = send(conversationId, student.id, "hello", "tab-1:7");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await otherServer.query("COMMIT");
    await otherServer.end();

    await expect(retry).resolves.toMatchObject({ ok: true, duplicate: true, message: { id: "first", seq: 1 } });
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({ lastSeq: 1 });
  });
});

describe("unread counts", () => {
  it("is lastSeq minus lastReadSeq, and reading only ever moves forward", async () => {
    const { teacher, student, conversationId } = await pair();
    await send(conversationId, student.id, "one");
    await send(conversationId, student.id, "two");
    const third = await send(conversationId, student.id, "three");
    expect(third).toMatchObject({ recipients: [{ userId: teacher.id, unread: 3 }] });

    const [teacherView] = await listConversationSummariesForUser(teacher.id);
    expect(teacherView).toMatchObject({ unread: 3, lastSeq: 3, lastMessage: "three" });
    // Your own messages are never unread to you.
    expect((await listConversationSummariesForUser(student.id))[0].unread).toBe(0);

    await expect(markChatRead(conversationId, teacher.id, 2)).resolves.toMatchObject({ lastReadSeq: 2, unread: 1 });
    // A late "read up to 1" from another tab doesn't undo it.
    await expect(markChatRead(conversationId, teacher.id, 1)).resolves.toMatchObject({ lastReadSeq: 2, unread: 1 });
    await expect(markChatRead(conversationId, teacher.id)).resolves.toMatchObject({ lastReadSeq: 3, unread: 0 });
  });

  it("pushes each member's inbox their own count when a message is sent", async () => {
    const { teacher, student, conversationId } = await pair();
    await sendMessage(student.id, conversationId, "hello");

    expect(emitRealtime).toHaveBeenCalledWith(
      `user:${teacher.id}`,
      "conversation:updated",
      expect.objectContaining({ conversationId, unread: 1, lastSeq: 1, preview: "hello" })
    );
    expect(emitRealtime).toHaveBeenCalledWith(`user:${student.id}`, "conversation:updated", expect.objectContaining({ unread: 0 }));
    expect(emitRealtime).toHaveBeenCalledWith(`conversation:${conversationId}`, "message:new", expect.objectContaining({ seq: 1 }));
  });
});

describe("catch-up after a reconnect", () => {
  it("returns only the messages after the newest one the client has, with removed text blanked", async () => {
    const { teacher, student, conversationId } = await pair();
    for (const text of ["a", "b", "c", "d"]) await send(conversationId, teacher.id, text);
    await prisma.message.updateMany({ where: { conversationId, seq: 3 }, data: { deletedAt: new Date() } });

    const { messages, reset } = await listMessagesAfter(conversationId, 2);
    expect(reset).toBe(false);
    expect(messages.map((m) => [m.seq, m.content])).toEqual([
      [3, ""],
      [4, "d"],
    ]);
    expect((await listMessagesAfter(conversationId, 2, { moderator: true })).messages[0].content).toBe("c");
    void student;
  });

  it("tells the client to reload instead when too much arrived to replay", async () => {
    const { teacher, conversationId } = await pair();
    const count = SYNC_LIMIT + 5;
    await prisma.message.createMany({
      data: Array.from({ length: count }, (_, i) => ({ conversationId, senderId: teacher.id, seq: i + 1, content: `m${i + 1}` })),
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastSeq: count } });

    const { messages, reset } = await listMessagesAfter(conversationId, 0);
    expect(reset).toBe(true);
    expect(messages).toHaveLength(SYNC_LIMIT);
  });
});

describe("one conversation per pair, course and support thread", () => {
  it("returns the same DM to both sides and to concurrent opens", async () => {
    const { teacher, student, conversationId } = await pair();
    const opens = await Promise.all([
      startDirectConversation(teacher.id, student.id),
      startDirectConversation(student.id, teacher.id),
      startDirectConversation(teacher.id, student.id),
    ]);
    expect(new Set(opens.map((o) => (o.ok ? o.conversationId : null)))).toEqual(new Set([conversationId]));
    expect(await prisma.conversation.count({ where: { type: "DIRECT" } })).toBe(1);
  });

  it("creates one course group however many students open it at once", async () => {
    const { teacher, student, course } = await pair();
    const opens = await Promise.all([
      getOrCreateCourseGroupConversation(student.id, course.id),
      getOrCreateCourseGroupConversation(teacher.id, course.id),
    ]);
    expect(new Set(opens.map((o) => (o.ok ? o.conversationId : null))).size).toBe(1);
    expect(await prisma.conversation.count({ where: { type: "COURSE_GROUP" } })).toBe(1);
  });
});
