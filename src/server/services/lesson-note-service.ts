import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";

/** The student's own note on a lesson, or null. Notes are private: there is no way to read
 * another user's, and losing access to the lesson hides them too. */
export async function getLessonNote(userId: string, lessonId: string) {
  if (!(await canAccessLesson(userId, lessonId))) return null;
  return prisma.lessonNote.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { content: true, updatedAt: true },
  });
}

/**
 * Saves the student's notepad for a lesson (one per student per lesson). Clearing every
 * character deletes the note rather than keeping an empty row. Content is validated by the
 * caller (lessonNoteSchema).
 */
export async function saveLessonNote(userId: string, lessonId: string, content: string) {
  if (!(await canAccessLesson(userId, lessonId))) return { error: "Forbidden" } as const;

  if (!content.trim()) {
    await prisma.lessonNote.deleteMany({ where: { userId, lessonId } });
    revalidateLearnPages();
    return { ok: true, note: null } as const;
  }

  const note = await prisma.lessonNote.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, content },
    update: { content },
    select: { content: true, updatedAt: true },
  });
  revalidateLearnPages();
  return { ok: true, note } as const;
}

/** The player is cached client-side for back/forward navigation; without this, going back to a
 * lesson would show the note as it was before the latest edits. */
function revalidateLearnPages() {
  revalidatePath("/student/course/[courseId]/learn", "page");
}
