import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, canAccessCourse } from "@/lib/permissions";
import { getCourseForLearning } from "@/server/services/course-service";
import { getCourseProgress, getLessonProgressMap } from "@/server/services/progress-service";
import { listQuizzesForCourse } from "@/server/services/quiz-attempt-service";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MarkCompleteButton } from "@/components/learning/mark-complete-button";
import { VideoPlayer } from "@/components/learning/video-player";
import { cn } from "@/lib/utils";

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { courseId } = await params;
  const { lesson: lessonIdParam } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = await canAccessCourse(user.id, courseId);
  if (!allowed) redirect("/student/my-courses");

  const course = await getCourseForLearning(courseId);
  if (!course) notFound();

  const [progress, progressMap, quizzes] = await Promise.all([
    getCourseProgress(user.id, courseId),
    getLessonProgressMap(user.id, courseId),
    listQuizzesForCourse(courseId),
  ]);

  const allLessons = course.sections.flatMap((s) => s.lessons);
  const activeLesson = allLessons.find((l) => l.id === lessonIdParam) ??
    allLessons.find((l) => l.id === progress.lastLessonId) ??
    allLessons[0];

  if (!activeLesson) {
    return <div className="p-6 text-muted-foreground">This course has no lessons yet.</div>;
  }

  const activeLessonProgress = progressMap.get(activeLesson.id);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <h1 className="font-semibold">{course.title}</h1>
          <div className="flex w-48 items-center gap-2">
            <Progress value={progress.percent} />
            <span className="text-sm whitespace-nowrap text-muted-foreground">{progress.percent}%</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          {course.sections.map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="px-2 text-sm font-medium">{section.title}</p>
              {section.lessons.map((lesson) => {
                const done = progressMap.get(lesson.id)?.completed ?? false;
                return (
                  <Link
                    key={lesson.id}
                    href={`/student/course/${courseId}/learn?lesson=${lesson.id}`}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
                      lesson.id === activeLesson.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span>{lesson.title}</span>
                    {done && <Badge variant="outline">Done</Badge>}
                  </Link>
                );
              })}
            </div>
          ))}

          {quizzes.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-sm font-medium">Quizzes</p>
              {quizzes.map((quiz) => (
                <Link
                  key={quiz.id}
                  href={`/student/quiz/${quiz.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                >
                  <span>{quiz.title}</span>
                  <Badge variant="outline">{quiz._count.questions} Q</Badge>
                </Link>
              ))}
            </div>
          )}
        </aside>

        <main className="space-y-4">
          <h2 className="text-xl font-semibold">{activeLesson.title}</h2>

          {activeLesson.type === "VIDEO" && activeLesson.videoAsset?.playbackUrl ? (
            <VideoPlayer url={activeLesson.videoAsset.playbackUrl} />
          ) : activeLesson.type === "TEXT" ? (
            <p className="whitespace-pre-line text-muted-foreground">{activeLesson.content}</p>
          ) : (
            <p className="text-muted-foreground">No content for this lesson yet.</p>
          )}

          <MarkCompleteButton
            lessonId={activeLesson.id}
            watchedSeconds={activeLesson.durationSec ?? 0}
            completed={activeLessonProgress?.completed ?? false}
          />
        </main>
      </div>
    </div>
  );
}
