import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canAccessLesson: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";
import { lessonNoteSchema, LESSON_NOTE_MAX_LENGTH } from "@/lib/validations/learning";
import { getLessonNote, saveLessonNote } from "./lesson-note-service";

const prisma = prismaClient as unknown as PrismaMock;
const canAccess = canAccessLesson as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
  canAccess.mockResolvedValue(true);
});

describe("saveLessonNote", () => {
  it("refuses a student without access to the lesson and writes nothing", async () => {
    canAccess.mockResolvedValue(false);

    await expect(saveLessonNote("student-1", "lesson-1", "my notes")).resolves.toEqual({ error: "Forbidden" });
    expect(canAccess).toHaveBeenCalledWith("student-1", "lesson-1");
    expect(prisma.lessonNote.upsert).not.toHaveBeenCalled();
    expect(prisma.lessonNote.deleteMany).not.toHaveBeenCalled();
  });

  it("upserts the one note per student per lesson", async () => {
    const updatedAt = new Date("2026-10-17T10:00:00Z");
    prisma.lessonNote.upsert.mockResolvedValue({ content: "Flexbox: justify vs align", updatedAt });

    const result = await saveLessonNote("student-1", "lesson-1", "Flexbox: justify vs align");

    expect(result).toEqual({ ok: true, note: { content: "Flexbox: justify vs align", updatedAt } });
    expect(prisma.lessonNote.upsert).toHaveBeenCalledWith({
      where: { userId_lessonId: { userId: "student-1", lessonId: "lesson-1" } },
      create: { userId: "student-1", lessonId: "lesson-1", content: "Flexbox: justify vs align" },
      update: { content: "Flexbox: justify vs align" },
      select: { content: true, updatedAt: true },
    });
  });

  it("deletes the note instead of keeping an empty one", async () => {
    await expect(saveLessonNote("student-1", "lesson-1", "  \n ")).resolves.toEqual({ ok: true, note: null });
    expect(prisma.lessonNote.deleteMany).toHaveBeenCalledWith({ where: { userId: "student-1", lessonId: "lesson-1" } });
    expect(prisma.lessonNote.upsert).not.toHaveBeenCalled();
  });
});

describe("getLessonNote", () => {
  it("reads only the caller's own note, and nothing once access is gone", async () => {
    prisma.lessonNote.findUnique.mockResolvedValue({ content: "mine", updatedAt: new Date() });
    await expect(getLessonNote("student-1", "lesson-1")).resolves.toMatchObject({ content: "mine" });
    expect(prisma.lessonNote.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_lessonId: { userId: "student-1", lessonId: "lesson-1" } } })
    );

    canAccess.mockResolvedValue(false);
    prisma.lessonNote.findUnique.mockClear();
    await expect(getLessonNote("student-1", "lesson-1")).resolves.toBeNull();
    expect(prisma.lessonNote.findUnique).not.toHaveBeenCalled();
  });
});

describe("lessonNoteSchema", () => {
  it("caps the length of a note", () => {
    expect(lessonNoteSchema.safeParse({ lessonId: "l1", content: "x".repeat(LESSON_NOTE_MAX_LENGTH) }).success).toBe(true);
    expect(lessonNoteSchema.safeParse({ lessonId: "l1", content: "x".repeat(LESSON_NOTE_MAX_LENGTH + 1) }).success).toBe(
      false
    );
    expect(lessonNoteSchema.safeParse({ lessonId: "", content: "hi" }).success).toBe(false);
  });
});
