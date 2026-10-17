import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLessonNote, saveLessonNote } from "@/server/services/lesson-note-service";
import { getCourseProgress, recordLessonProgress, recordLessonView } from "@/server/services/progress-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

async function enrolledStudentIn(course: { id: string }) {
  const student = await createUser();
  await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
  return student;
}

describe("lesson notes", () => {
  it("keeps one private note per student per lesson, updated in place and removed when cleared", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id);
    const lesson = course.sections[0].lessons[0];
    const amina = await enrolledStudentIn(course);
    const babul = await enrolledStudentIn(course);

    await expect(saveLessonNote(amina.id, lesson.id, "Box model: margin is outside the border")).resolves.toMatchObject({
      ok: true,
    });
    await saveLessonNote(amina.id, lesson.id, "Box model: margin is outside the border\nপ্যাডিং ভেতরে");
    await saveLessonNote(babul.id, lesson.id, "Babul's own note");

    await expect(prisma.lessonNote.count({ where: { userId: amina.id } })).resolves.toBe(1);
    await expect(getLessonNote(amina.id, lesson.id)).resolves.toMatchObject({
      content: "Box model: margin is outside the border\nপ্যাডিং ভেতরে",
    });
    // Each student only ever gets their own note back.
    await expect(getLessonNote(babul.id, lesson.id)).resolves.toMatchObject({ content: "Babul's own note" });

    await expect(saveLessonNote(amina.id, lesson.id, "   ")).resolves.toEqual({ ok: true, note: null });
    await expect(getLessonNote(amina.id, lesson.id)).resolves.toBeNull();
    await expect(prisma.lessonNote.count()).resolves.toBe(1);
  });

  it("refuses students without lesson access, and hides notes once access ends", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id);
    const lesson = course.sections[0].lessons[1];
    const outsider = await createUser();
    const student = await enrolledStudentIn(course);

    await expect(saveLessonNote(outsider.id, lesson.id, "sneaky")).resolves.toEqual({ error: "Forbidden" });
    await expect(prisma.lessonNote.count()).resolves.toBe(0);

    await saveLessonNote(student.id, lesson.id, "before the refund");
    await prisma.enrollment.update({
      where: { userId_courseId: { userId: student.id, courseId: course.id } },
      data: { status: "REFUNDED" },
    });

    await expect(getLessonNote(student.id, lesson.id)).resolves.toBeNull();
    await expect(saveLessonNote(student.id, lesson.id, "after the refund")).resolves.toEqual({ error: "Forbidden" });
  });

  it("are deleted with their lesson", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id);
    const lesson = course.sections[0].lessons[0];
    const student = await enrolledStudentIn(course);
    await saveLessonNote(student.id, lesson.id, "notes");

    await prisma.lesson.delete({ where: { id: lesson.id } });

    await expect(prisma.lessonNote.count()).resolves.toBe(0);
  });
});

describe("resuming a course", () => {
  it("reopens the lesson viewed last, not the one completed last, and viewing never completes", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { lessons: 3 });
    const [first, second, third] = course.sections[0].lessons;
    const student = await enrolledStudentIn(course);

    await expect(getCourseProgress(student.id, course.id)).resolves.toMatchObject({ lastLessonId: null });

    await recordLessonView(student.id, first.id, new Date("2026-10-17T10:00:00Z"));
    await recordLessonProgress(student.id, first.id, true);
    await recordLessonView(student.id, third.id, new Date("2026-10-17T10:05:00Z"));
    await recordLessonView(student.id, second.id, new Date("2026-10-17T10:10:00Z"));
    // Completing an older lesson later must not move the resume point back to it.
    await recordLessonProgress(student.id, third.id, true);

    await expect(getCourseProgress(student.id, course.id)).resolves.toEqual({
      totalLessons: 3,
      completedLessons: 2,
      percent: 66,
      isComplete: false,
      lastLessonId: second.id,
    });

    // Re-opening a finished lesson keeps it finished.
    await recordLessonView(student.id, first.id, new Date("2026-10-17T10:15:00Z"));
    await expect(
      prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: student.id, lessonId: first.id } } })
    ).resolves.toMatchObject({ completed: true });
    await expect(getCourseProgress(student.id, course.id)).resolves.toMatchObject({ lastLessonId: first.id });
  });

  it("falls back to progress rows saved before lastViewedAt existed", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { lessons: 2 });
    const [first, second] = course.sections[0].lessons;
    const student = await enrolledStudentIn(course);
    // A legacy row (no lastViewedAt) and a newer viewed row: the viewed one wins, nulls sort last.
    await prisma.lessonProgress.create({ data: { userId: student.id, lessonId: second.id, completed: true } });
    await expect(getCourseProgress(student.id, course.id)).resolves.toMatchObject({ lastLessonId: second.id });

    await recordLessonView(student.id, first.id);
    await expect(getCourseProgress(student.id, course.id)).resolves.toMatchObject({ lastLessonId: first.id });
  });

  it("doesn't record views for lessons the student can't open", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id);
    const outsider = await createUser();

    await expect(recordLessonView(outsider.id, course.sections[0].lessons[0].id)).resolves.toEqual({
      error: "Forbidden",
    });
    await expect(prisma.lessonProgress.count()).resolves.toBe(0);
  });
});
