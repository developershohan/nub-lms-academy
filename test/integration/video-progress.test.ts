import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordLessonProgress, recordLessonView, recordVideoProgress } from "@/server/services/progress-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

const t0 = new Date("2026-10-18T10:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

/** An enrolled student, and a ten-minute video lesson they opened at t0. */
async function watching({ durationSec = 600 }: { durationSec?: number | null } = {}) {
  const teacher = await createUser(["TEACHER"]);
  const student = await createUser();
  const course = await createCourse(teacher.id, { lessons: 2 });
  await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
  const lesson = course.sections[0].lessons[0];
  await prisma.lesson.update({ where: { id: lesson.id }, data: { type: "VIDEO", durationSec } });
  await recordLessonView(student.id, lesson.id, t0);
  const report = (positionSec: number, seconds: number, ended = false) =>
    recordVideoProgress(student.id, lesson.id, { positionSec, ended }, at(seconds));
  const progress = () => prisma.lessonProgress.findUniqueOrThrow({ where: { userId_lessonId: { userId: student.id, lessonId: lesson.id } } });
  return { student, lesson, report, progress };
}

describe("video progress", () => {
  it("credits real playback and remembers the position", async () => {
    const { report, progress } = await watching();
    await report(15, 15);
    await report(30, 30);
    await expect(progress()).resolves.toMatchObject({ watchedSeconds: 30, positionSec: 30, completed: false });
  });

  it("caps a faked jump to the end by the time that really passed", async () => {
    const { report, progress } = await watching();
    const result = await report(600, 2, true);

    expect(result).toMatchObject({ ok: true, completed: false, justCompleted: false });
    // Two real seconds at up to 2x, plus slack - nowhere near the 540s needed to complete.
    await expect(progress()).resolves.toMatchObject({ watchedSeconds: 9, positionSec: 600, completed: false });
  });

  it("completes the lesson once 90% has really been watched, and only once", async () => {
    const { report, progress } = await watching({ durationSec: 60 });
    await report(15, 15);
    await report(30, 30);
    await report(45, 45);
    const done = await report(55, 55);
    expect(done).toMatchObject({ completed: true, justCompleted: true });

    const again = await report(60, 60, true);
    expect(again).toMatchObject({ completed: true, justCompleted: false });
    await expect(progress()).resolves.toMatchObject({ completed: true, watchedSeconds: 60 });
  });

  it("never auto-completes a lesson whose length isn't known", async () => {
    const { report, progress } = await watching({ durationSec: null });
    for (let s = 15; s <= 900; s += 15) await report(s, s);
    await expect(progress()).resolves.toMatchObject({ completed: false, watchedSeconds: 900 });
  });

  it("ignores watch time sent with a manual completion, and never un-completes", async () => {
    const { student, lesson, report, progress } = await watching();
    await report(15, 15);
    await recordLessonProgress(student.id, lesson.id, false);
    await expect(progress()).resolves.toMatchObject({ completed: false, watchedSeconds: 15 });

    await recordLessonProgress(student.id, lesson.id, true);
    await recordLessonProgress(student.id, lesson.id, false);
    await expect(progress()).resolves.toMatchObject({ completed: true, watchedSeconds: 15 });
  });

  it("refuses reports from someone without access to the lesson", async () => {
    const { lesson } = await watching();
    const outsider = await createUser();
    await expect(recordVideoProgress(outsider.id, lesson.id, { positionSec: 10 })).resolves.toEqual({ error: "Forbidden" });
  });
});
