import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, canGenerateCertificate } from "@/lib/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { unpublishCourse } from "@/server/services/course-service";
import { banUser } from "@/server/services/user-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

describe("course access", () => {
  it("keeps enrolled students in after an admin unpublishes the course, and keeps others out", async () => {
    const admin = await createUser(["ADMIN"]);
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const outsider = await createUser();
    const course = await createCourse(teacher.id);
    await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });

    await expect(unpublishCourse(admin.id, course.id)).resolves.toEqual({ ok: true });

    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
    await expect(canAccessCourse(outsider.id, course.id)).resolves.toBe(false);
    await expect(canAccessCourse(admin.id, course.id)).resolves.toBe(true);
  });

  it("gives subscribers access only to published, subscription-included courses", async () => {
    const teacher = await createUser(["TEACHER"]);
    const subscriber = await createUser();
    const plan = await prisma.subscriptionPlan.create({ data: { name: "Monthly", interval: "MONTH", price: 9 } });
    await prisma.subscription.create({ data: { userId: subscriber.id, planId: plan.id, status: "ACTIVE" } });
    const included = await createCourse(teacher.id, { isSubscriptionIncluded: true });
    const notIncluded = await createCourse(teacher.id);
    const unpublished = await createCourse(teacher.id, { isSubscriptionIncluded: true, status: "APPROVED" });

    await expect(canAccessCourse(subscriber.id, included.id)).resolves.toBe(true);
    await expect(canAccessCourse(subscriber.id, notIncluded.id)).resolves.toBe(false);
    await expect(canAccessCourse(subscriber.id, unpublished.id)).resolves.toBe(false);
  });
});

describe("certificate eligibility", () => {
  it("ignores an empty quiz but requires passing every quiz that has questions", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id);
    await prisma.enrollment.create({
      data: { userId: student.id, courseId: course.id, source: "PURCHASE", completedAt: new Date() },
    });
    const quiz = await prisma.quiz.create({ data: { courseId: course.id, title: "Final quiz" } });

    await expect(canGenerateCertificate(student.id, course.id)).resolves.toBe(true);

    await prisma.question.create({
      data: { quizId: quiz.id, prompt: "2 + 2?", options: { create: [{ content: "4", isCorrect: true }] } },
    });
    await expect(canGenerateCertificate(student.id, course.id)).resolves.toBe(false);

    await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId: student.id, status: "SUBMITTED", score: 100, passed: true, submittedAt: new Date() },
    });
    await expect(canGenerateCertificate(student.id, course.id)).resolves.toBe(true);
  });
});

describe("account security", () => {
  it("counts rate-limit hits in Postgres and starts a new window when the old one ends", async () => {
    const rule = { limit: 2, windowSec: 60 };
    const t0 = new Date("2026-10-17T12:00:00Z");

    await expect(consumeRateLimit("login:ip:203.0.113.9", rule, t0)).resolves.toMatchObject({ limited: false });
    await expect(consumeRateLimit("login:ip:203.0.113.9", rule, t0)).resolves.toMatchObject({ limited: false });
    await expect(consumeRateLimit("login:ip:203.0.113.9", rule, t0)).resolves.toEqual({ limited: true, retryAfterSec: 60 });

    const afterWindow = new Date(t0.getTime() + 61_000);
    await expect(consumeRateLimit("login:ip:203.0.113.9", rule, afterWindow)).resolves.toMatchObject({ limited: false });
  });

  it("bans by ending every session of the account", async () => {
    const admin = await createUser(["ADMIN"]);
    const student = await createUser();

    await expect(banUser(admin.id, student.id, "abuse")).resolves.toEqual({ ok: true });

    await expect(prisma.user.findUniqueOrThrow({ where: { id: student.id } })).resolves.toMatchObject({
      status: "BANNED",
      sessionVersion: 1,
    });
  });
});
