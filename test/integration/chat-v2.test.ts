// Phase 2 additions to the chat domain on a real PostgreSQL: roles and channels, membership that
// follows course access, tickets, blocks, reports and lesson Q&A. The socket-level behaviour is in
// realtime.test.ts; the seq/idempotency basics are in chat.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { realtimeBus } from "@/lib/realtime";
import { getChatUser, resolveAccess } from "@/server/chat/access";
import { createBatchChannel, ensureCourseChannels, timeoutMember } from "@/server/chat/channels";
import { reconcileCourseGroups } from "@/server/chat/membership";
import { editChatMessage, removeChatMessage, sendChatMessage, toggleReaction } from "@/server/chat/messages";
import { answerQuestion, askQuestion, listQuestions, toggleUpvote } from "@/server/chat/qa";
import { blockUser, listOpenReports, reportMessage, resolveReport } from "@/server/chat/safety";
import { listTickets, updateTicket } from "@/server/chat/support";
import { notify } from "@/server/services/notification-service";
import {
  getOrCreateCourseGroupConversation,
  listConversationSummariesForUser,
  sendMessage,
  startDirectConversation,
  startSupportConversation,
  updateSupportTicket,
} from "@/server/services/chat-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(realtimeBus.emit).mockClear();
});

async function chatUser(roles: Parameters<typeof createUser>[0] = ["STUDENT"]) {
  const user = await createUser(roles);
  return (await getChatUser(user.id))!;
}

async function enroll(userId: string, courseId: string) {
  await prisma.enrollment.create({ data: { userId, courseId, source: "PURCHASE" } });
}

let n = 0;
const id = () => `it-${Date.now().toString(36)}-${(n++).toString(36)}`;

describe("course communities", () => {
  it("gives every course #general, #announcements and #q-and-a, with the teacher owning and students as members", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const helper = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const course = await createCourse(teacher.id);
    await prisma.courseInstructor.create({ data: { courseId: course.id, userId: helper.id, addedById: teacher.id } });
    await enroll(student.id, course.id);

    for (const u of [teacher, helper, student]) await reconcileCourseGroups(realtimeBus, u.id);

    const channels = await ensureCourseChannels(course.id);
    expect(channels.map((c) => c.channel)).toEqual(["GENERAL", "ANNOUNCEMENTS", "QA"]);
    const general = channels[0];
    const roles = await prisma.conversationParticipant.findMany({ where: { conversationId: general.id }, select: { userId: true, role: true } });
    expect(new Map(roles.map((r) => [r.userId, r.role]))).toEqual(new Map([[teacher.id, "OWNER"], [helper.id, "MODERATOR"], [student.id, "MEMBER"]]));
    // #general keeps the key the old course group had, so existing links and data still resolve.
    await expect(prisma.conversation.findUnique({ where: { uniqueKey: `course:${course.id}` } })).resolves.toMatchObject({ id: general.id });
  });

  it("lets only instructors post in #announcements, and everyone read it", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const course = await createCourse(teacher.id);
    await enroll(student.id, course.id);
    const announcements = (await ensureCourseChannels(course.id)).find((c) => c.channel === "ANNOUNCEMENTS")!;

    await expect(resolveAccess(student, announcements.id)).resolves.toMatchObject({ ok: true, canPost: false, postingBlockedReason: expect.stringMatching(/instructors/) });
    await expect(resolveAccess(teacher, announcements.id)).resolves.toMatchObject({ ok: true, canPost: true, canModerate: true });
    await expect(sendMessage(student.id, announcements.id, "hello?")).resolves.toMatchObject({ error: expect.stringMatching(/instructors/) });
    await expect(sendMessage(teacher.id, announcements.id, "Welcome!")).resolves.toMatchObject({ ok: true });
  });

  it("removes a refunded student from the channels and adds them back on re-enrollment, read position intact", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const course = await createCourse(teacher.id);
    await enroll(student.id, course.id);
    await reconcileCourseGroups(realtimeBus, student.id);
    const general = await prisma.conversation.findUniqueOrThrow({ where: { uniqueKey: `course:${course.id}` } });
    await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: general.id, userId: student.id } }, data: { lastReadSeq: 7 } });

    await prisma.enrollment.updateMany({ where: { userId: student.id }, data: { status: "REFUNDED" } });
    const { removed } = await reconcileCourseGroups(realtimeBus, student.id);
    expect(removed).toContain(general.id);
    await expect(resolveAccess(student, general.id)).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(realtimeBus.removeUserFromRoom).toHaveBeenCalledWith(student.id, `conversation:${general.id}`);
    expect((await listConversationSummariesForUser(student.id)).map((c) => c.id)).not.toContain(general.id);

    await prisma.enrollment.updateMany({ where: { userId: student.id }, data: { status: "ACTIVE" } });
    const { added } = await reconcileCourseGroups(realtimeBus, student.id);
    expect(added).toContain(general.id);
    await expect(prisma.conversationParticipant.findUniqueOrThrow({ where: { conversationId_userId: { conversationId: general.id, userId: student.id } } })).resolves.toMatchObject({ removedAt: null, lastReadSeq: 7 });
  });

  it("lets an instructor create a batch channel and time a member out", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const course = await createCourse(teacher.id);
    await enroll(student.id, course.id);
    await reconcileCourseGroups(realtimeBus, student.id);

    await expect(createBatchChannel(student, course.id, "Batch 7")).resolves.toMatchObject({ error: "Forbidden" });
    const batch = await createBatchChannel(teacher, course.id, "Batch 7, Jan 2027");
    expect(batch).toMatchObject({ ok: true });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: (batch as { conversationId: string }).conversationId } })).resolves.toMatchObject({ channel: "BATCH", title: "Batch 7, Jan 2027" });

    const general = await prisma.conversation.findUniqueOrThrow({ where: { uniqueKey: `course:${course.id}` } });
    await expect(timeoutMember(realtimeBus, teacher, general.id, student.id, new Date(Date.now() + 600_000))).resolves.toEqual({ ok: true });
    await expect(resolveAccess(student, general.id)).resolves.toMatchObject({ ok: true, canPost: false, postingBlockedReason: expect.stringMatching(/paused/) });
    await expect(timeoutMember(realtimeBus, teacher, general.id, student.id, null)).resolves.toEqual({ ok: true });
    await expect(resolveAccess(student, general.id)).resolves.toMatchObject({ canPost: true });
  });
});

describe("replies, edits, removal and reactions", () => {
  it("keeps a reply's quote, strips removed text for everyone and groups reactions", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const course = await createCourse(teacher.id);
    await enroll(student.id, course.id);
    const dm = await startDirectConversation(student.id, teacher.id);
    if (!dm.ok) throw new Error(dm.error);

    const first = await sendChatMessage({ conversationId: dm.conversationId, senderId: student.id, content: "Is lesson 3 graded?" });
    if (!first.ok) throw new Error(first.error);
    const reply = await sendChatMessage({ conversationId: dm.conversationId, senderId: teacher.id, content: "Yes, next week", replyToId: first.message.id });
    if (!reply.ok) throw new Error(reply.error);
    expect(reply.message.replyTo).toMatchObject({ id: first.message.id, seq: 1, preview: "Is lesson 3 graded?" });

    await expect(editChatMessage({ messageId: first.message.id, userId: teacher.id, content: "nope" })).resolves.toMatchObject({ error: "Forbidden" });
    await expect(editChatMessage({ messageId: first.message.id, userId: student.id, content: "Is lesson 3 graded? (edited)" })).resolves.toMatchObject({ ok: true, message: { content: "Is lesson 3 graded? (edited)", editedAt: expect.any(Date) } });

    await toggleReaction({ messageId: reply.message.id, userId: student.id, emoji: "👍" });
    const reacted = await toggleReaction({ messageId: reply.message.id, userId: teacher.id, emoji: "👍" });
    expect(reacted).toMatchObject({ ok: true, message: { reactions: [{ emoji: "👍", count: 2 }] } });
    const toggled = await toggleReaction({ messageId: reply.message.id, userId: teacher.id, emoji: "👍" });
    expect(toggled).toMatchObject({ message: { reactions: [{ emoji: "👍", count: 1, userIds: [student.id] }] } });

    await expect(removeChatMessage({ messageId: first.message.id, userId: teacher.id })).resolves.toMatchObject({ error: "Forbidden" });
    const removed = await removeChatMessage({ messageId: first.message.id, userId: teacher.id, moderator: true });
    expect(removed).toMatchObject({ ok: true, byModerator: true, message: { content: "", removedByModerator: true, reactions: [] } });
    // The quote on the reply goes blank too, and the stored text is still there for staff.
    const again = await sendChatMessage({ conversationId: dm.conversationId, senderId: teacher.id, content: "see above", replyToId: first.message.id });
    expect(again).toMatchObject({ ok: true, message: { replyTo: { deleted: true, preview: "" } } });
    await expect(prisma.message.findUniqueOrThrow({ where: { id: first.message.id } })).resolves.toMatchObject({ content: "Is lesson 3 graded? (edited)" });
  });
});

describe("blocks and reports", () => {
  it("stops a DM both ways after a block, and lets the blocker lift it", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const student = await chatUser();
    const support = await chatUser(["SUPPORT"]);
    const course = await createCourse(teacher.id);
    await enroll(student.id, course.id);
    const dm = await startDirectConversation(student.id, teacher.id);
    if (!dm.ok) throw new Error(dm.error);

    await expect(blockUser(realtimeBus, student, support.id)).resolves.toMatchObject({ error: expect.stringMatching(/staff/) });
    await expect(blockUser(realtimeBus, student, teacher.id)).resolves.toEqual({ ok: true });
    await expect(resolveAccess(teacher, dm.conversationId)).resolves.toMatchObject({ canPost: false, blocked: "by_them" });
    await expect(resolveAccess(student, dm.conversationId)).resolves.toMatchObject({ canPost: false, blocked: "by_me" });
    await expect(sendMessage(teacher.id, dm.conversationId, "hello?")).resolves.toMatchObject({ error: expect.stringMatching(/can't reply/) });
    await expect(startDirectConversation(teacher.id, student.id)).resolves.toMatchObject({ error: expect.stringMatching(/can't message/) });
    expect(realtimeBus.emit).toHaveBeenCalledWith(`user:${teacher.id}`, "conversation:updated", expect.objectContaining({ conversationId: dm.conversationId, blocked: "by_them", canPost: false }));
  });

  it("files one report per reporter, alerts staff once, and closes every report when the message is removed", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const a = await chatUser();
    const b = await chatUser();
    const agent = await chatUser(["SUPPORT"]);
    const course = await createCourse(teacher.id);
    for (const u of [a, b]) await enroll(u.id, course.id);
    const group = await getOrCreateCourseGroupConversation(teacher.id, course.id);
    if (!group.ok) throw new Error(group.error);
    const bad = await sendChatMessage({ conversationId: group.conversationId, senderId: teacher.id, content: "something rude" });
    if (!bad.ok) throw new Error(bad.error);

    await expect(reportMessage(notify, teacher, bad.message.id, "x")).resolves.toMatchObject({ error: expect.stringMatching(/own message/) });
    await reportMessage(notify, a, bad.message.id, "rude");
    await reportMessage(notify, a, bad.message.id, "rude again");
    await reportMessage(notify, b, bad.message.id, undefined);
    await expect(prisma.report.count({ where: { messageId: bad.message.id } })).resolves.toBe(2);
    const alerts = await prisma.notification.findMany({ where: { userId: agent.id, type: "message_report" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data).toMatchObject({ count: 2 });

    const open = await listOpenReports(agent);
    expect(open).toHaveLength(2);
    expect(open[0].message).toMatchObject({ content: "something rude" });
    await expect(resolveReport(agent, open[0].id, "remove")).resolves.toMatchObject({ ok: true, removed: { content: "" } });
    await expect(prisma.report.findMany({ where: { messageId: bad.message.id } })).resolves.toEqual([
      expect.objectContaining({ status: "RESOLVED" }),
      expect.objectContaining({ status: "RESOLVED" }),
    ]);
  });
});

describe("support tickets", () => {
  it("opens on the first message, waits on the customer after a staff reply, and reopens when the customer writes again", async () => {
    const customer = await chatUser();
    const agent = await chatUser(["SUPPORT"]);
    const other = await chatUser();
    const thread = await startSupportConversation(customer.id);
    if (!thread.ok) throw new Error("no thread");

    await expect(resolveAccess(other, thread.conversationId)).resolves.toEqual({ ok: false, reason: "forbidden" });
    await sendMessage(customer.id, thread.conversationId, "I can't open my course");
    let ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { conversationId: thread.conversationId } });
    expect(ticket).toMatchObject({ status: "OPEN", subject: "I can't open my course", assigneeId: null });
    await expect(prisma.notification.findFirst({ where: { userId: agent.id, type: "support_request" } })).resolves.toMatchObject({ title: expect.stringMatching(/Support request from/) });

    await sendMessage(agent.id, thread.conversationId, "Looking now");
    ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(ticket).toMatchObject({ status: "PENDING", assigneeId: agent.id });
    expect(ticket.firstResponseAt).not.toBeNull();
    expect((await listTickets(agent, { assignee: "me" }) as { id: string }[]).map((t) => t.id)).toEqual([ticket.id]);

    await expect(updateSupportTicket(agent.id, ticket.id, { status: "RESOLVED" })).resolves.toMatchObject({ ok: true, ticket: { status: "RESOLVED" } });
    // The status change left a note in the thread.
    await expect(prisma.message.count({ where: { conversationId: thread.conversationId, type: "SYSTEM" } })).resolves.toBe(1);
    await sendMessage(customer.id, thread.conversationId, "Still broken");
    await expect(prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).resolves.toMatchObject({ status: "OPEN", assigneeId: null });
    await expect(prisma.notification.findFirst({ where: { userId: agent.id, type: "support_request" }, orderBy: { createdAt: "desc" } })).resolves.toMatchObject({ title: expect.stringMatching(/reopened/) });
  });

  it("only lets staff take tickets, and tells a newly assigned colleague", async () => {
    const customer = await chatUser();
    const agent = await chatUser(["SUPPORT"]);
    const colleague = await chatUser(["ADMIN"]);
    const thread = await startSupportConversation(customer.id);
    if (!thread.ok) throw new Error("no thread");
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { conversationId: thread.conversationId } });

    await expect(updateTicket(customer, ticket.id, { status: "CLOSED" })).resolves.toMatchObject({ error: "Forbidden" });
    await expect(updateTicket(agent, ticket.id, { assigneeId: customer.id })).resolves.toMatchObject({ error: expect.stringMatching(/support staff/) });
    await expect(updateSupportTicket(agent.id, ticket.id, { assigneeId: colleague.id, priority: "HIGH" })).resolves.toMatchObject({ ok: true, ticket: { priority: "HIGH", assignee: { id: colleague.id } } });
    await expect(prisma.notification.findFirst({ where: { userId: colleague.id, type: "ticket_assigned" } })).resolves.not.toBeNull();
  });
});

describe("lesson Q&A", () => {
  it("lets students ask and upvote, and the instructor's answer marks it answered and tells the asker", async () => {
    const teacher = await chatUser(["TEACHER"]);
    const asker = await chatUser();
    const voter = await chatUser();
    const stranger = await chatUser();
    const course = await createCourse(teacher.id, { lessons: 2 });
    for (const u of [asker, voter]) await enroll(u.id, course.id);
    const lesson = course.sections[0].lessons[0];

    await expect(askQuestion(notify, stranger, lesson.id, { title: "Hi", body: "?" })).resolves.toMatchObject({ error: "Forbidden" });
    const asked = await askQuestion(notify, asker, lesson.id, { title: "Why does the build fail?", body: "It says module not found." });
    if (!asked.ok) throw new Error(asked.error);
    await expect(prisma.notification.findFirst({ where: { userId: teacher.id, type: "lesson_question" } })).resolves.not.toBeNull();

    await expect(toggleUpvote(voter, asked.question.id)).resolves.toMatchObject({ ok: true, upvoted: true, upvotes: 1 });
    await expect(toggleUpvote(voter, asked.question.id)).resolves.toMatchObject({ upvoted: false, upvotes: 0 });
    await toggleUpvote(voter, asked.question.id);

    const peer = await answerQuestion(notify, voter, asked.question.id, "Check your imports");
    expect(peer).toMatchObject({ ok: true, answer: { isInstructor: false, accepted: false } });
    await expect(prisma.lessonQuestion.findUniqueOrThrow({ where: { id: asked.question.id } })).resolves.toMatchObject({ answeredAt: null, answerCount: 1 });

    const official = await answerQuestion(notify, teacher, asked.question.id, "Run npm ci first");
    expect(official).toMatchObject({ ok: true, answer: { isInstructor: true, accepted: true } });
    const listed = await listQuestions(asker, course.id, { lessonId: lesson.id });
    expect(listed).toMatchObject({ ok: true, questions: [{ id: asked.question.id, upvotes: 1, answerCount: 2, answeredAt: expect.any(String), voted: false }] });
    await expect(prisma.notification.count({ where: { userId: asker.id, type: "question_answered" } })).resolves.toBe(1);
  });
});

void id;
