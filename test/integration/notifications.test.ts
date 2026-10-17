import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { sendNotificationEmail } from "@/lib/email";
import {
  getNotificationPreferences,
  markNotificationRead,
  notify,
  updateNotificationPreferences,
} from "@/server/services/notification-service";
import {
  markConversationRead,
  sendMessage,
  startDirectConversation,
  startSupportConversation,
} from "@/server/services/chat-service";
import { approveCourse } from "@/server/services/course-service";
import { submitReview } from "@/server/services/review-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(emitRealtime).mockClear();
  vi.mocked(sendNotificationEmail).mockClear();
});

const pushedTo = (userId: string) =>
  vi
    .mocked(emitRealtime)
    .mock.calls.filter(([room, event]) => room === `user:${userId}` && event === "notification:new")
    .map(([, , payload]) => payload as { notification: { title: string; data: { count?: number } | null }; unreadCount: number });

describe("notify()", () => {
  it("writes the notification and pushes it whole, with the new unread count", async () => {
    const user = await createUser();
    await notify([user.id], { type: "enrollment", title: "You were enrolled in Web Basics", link: "/student/my-courses" });

    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);
    expect(pushedTo(user.id)).toEqual([
      expect.objectContaining({
        notification: expect.objectContaining({ title: "You were enrolled in Web Basics", link: "/student/my-courses", status: "UNREAD" }),
        unreadCount: 1,
      }),
    ]);
  });

  it("collapses repeats with a group key into one unread notification with a count", async () => {
    const user = await createUser();
    const ping = (body: string) => notify([user.id], { type: "message", title: "Naima sent you a message", body, groupKey: "conversation:c1" });
    await ping("one");
    await ping("two");
    await ping("three");

    const rows = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: "three", data: { count: 3 } });
    expect(pushedTo(user.id).map((p) => p.unreadCount)).toEqual([1, 1, 1]);

    // Once read, the next message starts a fresh notification.
    await markNotificationRead(user.id, rows[0].id);
    await ping("four");
    expect(await prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } })).toBe(1);
  });

  it("never notifies whoever caused it", async () => {
    const actor = await createUser();
    const other = await createUser();
    await notify([actor.id, other.id], { type: "message", title: "Hi", actorId: actor.id });
    expect(await prisma.notification.count({ where: { userId: actor.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(1);
  });
});

describe("preferences", () => {
  it("skips the in-app copy for a muted category and emails only who asked", async () => {
    const muted = await createUser();
    const emailed = await createUser();
    await updateNotificationPreferences(muted.id, [{ category: "teaching", inApp: false, email: false }]);
    // Teaching email is on by default; this user also keeps in-app.
    await notify([muted.id, emailed.id], { type: "course_review", title: "New 5-star review" });

    expect(await prisma.notification.count({ where: { userId: muted.id } })).toBe(0);
    expect(pushedTo(muted.id)).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: emailed.id } })).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).toHaveBeenCalledWith(emailed.email, expect.objectContaining({ title: "New 5-star review" }));
  });

  it("keeps locked channels on whatever is saved, and never emails chat", async () => {
    const user = await createUser();
    await updateNotificationPreferences(user.id, [
      { category: "account", inApp: false, email: false },
      { category: "messages", inApp: true, email: true },
    ]);
    const prefs = new Map((await getNotificationPreferences(user.id)).map((p) => [p.category, p]));
    expect(prefs.get("account")).toMatchObject({ inApp: true, email: false });
    expect(prefs.get("messages")).toMatchObject({ inApp: true, email: false });

    await notify([user.id], { type: "message", title: "Hi" });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});

describe("events that notify", () => {
  async function teacherAndStudent() {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id);
    await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
    return { teacher, student, course };
  }

  it("a chat message notifies the other member, and reading the conversation clears it", async () => {
    const { teacher, student } = await teacherAndStudent();
    const dm = await startDirectConversation(student.id, teacher.id);
    if (!dm.ok) throw new Error(dm.error);
    await sendMessage(student.id, dm.conversationId, "Question about lesson 3");
    await sendMessage(student.id, dm.conversationId, "And lesson 4");

    const [row] = await prisma.notification.findMany({ where: { userId: teacher.id } });
    expect(row).toMatchObject({ type: "message", data: { count: 2 }, link: `/messages?c=${dm.conversationId}` });

    await markConversationRead(teacher.id, dm.conversationId);
    await expect(prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ status: "READ" });
    expect(emitRealtime).toHaveBeenCalledWith(`user:${teacher.id}`, "notification:read", {
      groupKey: `conversation:${dm.conversationId}`,
      unreadCount: 0,
    });
  });

  it("a student's support message alerts support staff", async () => {
    const student = await createUser();
    const agent = await createUser(["SUPPORT"]);
    const thread = await startSupportConversation(student.id);
    if (!thread.ok) throw new Error("no thread");
    await sendMessage(student.id, thread.conversationId, "I can't download my certificate");

    await expect(prisma.notification.findFirstOrThrow({ where: { userId: agent.id } })).resolves.toMatchObject({
      type: "support_request",
      groupKey: `support:${thread.conversationId}`,
    });
  });

  it("tells the teacher when their course is approved and when it gets its first review from a student", async () => {
    const { teacher, student, course } = await teacherAndStudent();
    const admin = await createUser(["ADMIN"]);
    await prisma.course.update({ where: { id: course.id }, data: { status: "IN_REVIEW" } });
    await approveCourse(admin.id, course.id);
    await submitReview(student.id, course.id, course.slug, 5, "Great");
    await submitReview(student.id, course.id, course.slug, 4, "Edited my review");

    const types = (await prisma.notification.findMany({ where: { userId: teacher.id }, orderBy: { createdAt: "asc" } })).map((n) => n.type);
    expect(types).toEqual(["course_decision", "course_review"]);
  });
});
