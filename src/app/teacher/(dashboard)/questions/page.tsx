import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/permissions";
import { getChatUser } from "@/server/chat/access";
import { qaRole, teacherQuestionCourses } from "@/server/chat/qa";
import { QuestionBoard } from "@/components/qa/question-board";
import { cn } from "@/lib/utils";

export const metadata = { title: "Student questions" };

/** Every question students asked on the teacher's courses; `?course=` picks one. */
export default async function TeacherQuestionsPage({ searchParams }: { searchParams: Promise<{ course?: string; q?: string }> }) {
  const user = await requireTeacher();
  const { course: requested, q } = await searchParams;
  const chatUser = (await getChatUser(user.id))!;
  const courses = await teacherQuestionCourses(chatUser);
  const courseId = courses.find((c) => c.id === requested)?.id ?? courses[0]?.id ?? null;
  const allowed = courseId ? (await qaRole(chatUser, courseId)) === "instructor" : false;

  const lessons = courseId
    ? (
        await prisma.courseSection.findMany({
          where: { courseId },
          orderBy: { sortOrder: "asc" },
          select: { lessons: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } } },
        })
      ).flatMap((s) => s.lessons)
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Student questions</h1>
        <p className="text-sm text-muted-foreground">Lesson Q&amp;A across your courses. Your answer marks a question as answered and tells the student.</p>
      </div>
      {courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">You don&apos;t have any courses yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/teacher/questions?course=${c.id}`}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors", c.id === courseId ? "border-primary bg-primary/10" : "hover:bg-muted")}
            >
              {c.title}
              {c.open > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{c.open}</span>}
            </Link>
          ))}
        </div>
      )}
      {courseId && allowed && <QuestionBoard key={courseId} courseId={courseId} lessons={lessons} currentUserId={user.id} instructor initialQuestionId={q ?? null} />}
    </div>
  );
}
