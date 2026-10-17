import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions";
import { getChatUser } from "@/server/chat/access";
import { qaRole } from "@/server/chat/qa";
import { QuestionBoard } from "@/components/qa/question-board";

export const metadata = { title: "Questions & answers" };

/** Lesson Q&A for a course the student is enrolled in (instructors see the same board with answer tools). */
export default async function CourseQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { courseId } = await params;
  const { q } = await searchParams;
  const chatUser = (await getChatUser(user.id))!;
  const role = await qaRole(chatUser, courseId);
  if (!role) notFound();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      sections: { orderBy: { sortOrder: "asc" }, select: { lessons: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } } } },
    },
  });
  if (!course) notFound();
  const lessons = course.sections.flatMap((s) => s.lessons);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/student/course/${courseId}/learn`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Back to the course
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">Questions &amp; answers</h1>
        <p className="text-sm text-muted-foreground">{course.title} · ask about any lesson, upvote what you also want answered.</p>
      </div>
      <QuestionBoard courseId={courseId} lessons={lessons} currentUserId={user.id} instructor={role === "instructor"} initialQuestionId={q ?? null} />
    </div>
  );
}
