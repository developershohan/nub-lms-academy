import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Award, BarChart3, Clock, FileText, Globe, ListChecks, PlayCircle, UserRound } from "lucide-react";
import { getCurrentUser, canAccessCourse } from "@/lib/permissions";
import { getCourseForLearning } from "@/server/services/course-service";
import { getCourseProgress, getLessonProgressMap } from "@/server/services/progress-service";
import { listPassedQuizIds, listQuizzesForCourse } from "@/server/services/quiz-attempt-service";
import { getLessonNote } from "@/server/services/lesson-note-service";
import { getCourseCertificateStatus } from "@/server/services/certificate-service";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LearnShell } from "@/components/learning/learn-shell";
import { CurriculumNav } from "@/components/learning/curriculum-nav";
import { ProgressRing } from "@/components/learning/progress-ring";
import { LessonArticle } from "@/components/learning/lesson-article";
import { LessonNavBar } from "@/components/learning/lesson-nav-bar";
import { LessonNotes } from "@/components/learning/lesson-notes";
import { RecordLessonView } from "@/components/learning/record-lesson-view";
import { VideoPlayer } from "@/components/learning/video-player";
import { CourseCompleteCard, certificateHref } from "@/components/learning/course-complete-card";
import { categoryStyle } from "@/lib/category-style";
import { formatLessonDuration, formatTotalDuration } from "@/lib/format";
import {
  LEARN_SIDEBAR_COOKIE,
  firstUnfinishedLesson,
  learnHref,
  lessonPosition,
  pickActiveLesson,
} from "@/lib/learning-path";
import { readingMinutes } from "@/lib/lesson-text";
import { cn } from "@/lib/utils";

function titleCase(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

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

  const [progress, progressMap, quizzes, passedQuizIds] = await Promise.all([
    getCourseProgress(user.id, courseId),
    getLessonProgressMap(user.id, courseId),
    listQuizzesForCourse(courseId),
    listPassedQuizIds(user.id, courseId),
  ]);
  const completedIds = new Set([...progressMap.values()].filter((p) => p.completed).map((p) => p.lessonId));

  const activeLesson = pickActiveLesson(course.sections, {
    requestedId: lessonIdParam,
    lastViewedId: progress.lastLessonId,
    completedIds,
  });

  if (!activeLesson) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Nothing here yet</p>
        <h1 className="font-heading text-2xl font-semibold">{course.title} has no lessons yet</h1>
        <p className="text-sm text-muted-foreground">Check back soon - the instructor is still building this course.</p>
        <Button variant="outline" render={<Link href="/student/my-courses" />}>
          Back to my courses
        </Button>
      </div>
    );
  }
  // Every lesson has its own URL - opening the course resumes by redirecting to it, so the
  // address can be bookmarked and Back works lesson by lesson.
  if (lessonIdParam !== activeLesson.id) redirect(learnHref(courseId, activeLesson.id));

  const [note, certificate, cookieStore] = await Promise.all([
    getLessonNote(user.id, activeLesson.id),
    progress.isComplete ? getCourseCertificateStatus(user.id, courseId) : null,
    cookies(),
  ]);

  const position = lessonPosition(course.sections, activeLesson.id)!;
  const sectionIndex = course.sections.findIndex((s) => s.lessons.some((l) => l.id === activeLesson.id));
  const section = course.sections[sectionIndex];
  const completed = completedIds.has(activeLesson.id);
  const firstUnfinished = firstUnfinishedLesson(course.sections, completedIds, activeLesson.id);
  const takeableQuizzes = quizzes.filter((q) => q._count.questions > 0);
  const lessonQuiz = takeableQuizzes.find((q) => q.lessonId === activeLesson.id);
  const pendingQuizzes = takeableQuizzes.filter((q) => !passedQuizIds.has(q.id));
  const spine = course.category ? categoryStyle(course.category) : null;
  const certificateLink = certificate ? certificateHref(certificate) : null;
  const totalDurationSec = course.sections.reduce(
    (sum, s) => sum + s.lessons.reduce((acc, l) => acc + (l.durationSec ?? 0), 0),
    0
  );
  const isVideo = activeLesson.type === "VIDEO";
  const playbackUrl = activeLesson.videoAsset?.playbackUrl;
  const minutesToRead = isVideo ? 0 : readingMinutes(activeLesson.content);
  const sectionCount = course.sections.length;
  const courseFacts = [
    { icon: UserRound, label: "Instructor", value: course.teacher.name ?? "Unknown instructor" },
    {
      icon: FileText,
      label: "Lessons",
      value: `${position.total} ${position.total === 1 ? "lesson" : "lessons"} in ${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`,
    },
    totalDurationSec > 0 && { icon: Clock, label: "Total length", value: formatTotalDuration(totalDurationSec) },
    { icon: BarChart3, label: "Level", value: titleCase(course.level) },
    { icon: Globe, label: "Language", value: course.language },
    takeableQuizzes.length > 0 && {
      icon: ListChecks,
      label: "Quizzes",
      value: `${takeableQuizzes.length - pendingQuizzes.length} of ${takeableQuizzes.length} passed`,
    },
  ].filter(Boolean) as { icon: typeof Clock; label: string; value: string }[];

  const bar = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        render={<Link href="/student/my-courses" />}
        aria-label="Back to my courses"
        title="Back to my courses"
      >
        <ArrowLeft aria-hidden />
      </Button>
      <span className={cn("hidden h-8 w-1 shrink-0 rounded-full sm:block", spine?.bar ?? "bg-primary")} aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {spine ? `${spine.code} · ${course.category!.name}` : "Course"}
        </p>
        <p className="truncate font-heading text-sm font-semibold sm:text-base">{course.title}</p>
      </div>
    </>
  );

  const status = (
    <>
      <div className="flex items-center gap-2">
        <ProgressRing percent={progress.percent} complete={progress.isComplete} />
        <p className="hidden text-xs leading-tight text-muted-foreground md:block">
          <span className="block font-medium text-foreground">
            {progress.isComplete ? "Course complete" : `${progress.percent}% complete`}
          </span>
          {progress.completedLessons} of {progress.totalLessons} lessons
        </p>
      </div>
      {certificateLink && (
        <Button
          size="sm"
          className="bg-amber text-amber-foreground hover:bg-amber/80"
          render={<Link href={certificateLink} />}
        >
          <Award aria-hidden />
          <span className="hidden sm:inline">Certificate</span>
        </Button>
      )}
    </>
  );

  const curriculum = (
    <CurriculumNav
      courseId={courseId}
      sections={course.sections}
      activeLessonId={activeLesson.id}
      completedIds={completedIds}
      quizzes={quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        questionCount: q._count.questions,
        passed: passedQuizIds.has(q.id),
      }))}
    />
  );

  return (
    <LearnShell
      activeLessonId={activeLesson.id}
      initialSidebarOpen={cookieStore.get(LEARN_SIDEBAR_COOKIE)?.value !== "closed"}
      bar={bar}
      status={status}
      curriculum={curriculum}
    >
      <RecordLessonView lessonId={activeLesson.id} />

      {isVideo && (
        <div className="bg-neutral-950">
          {/* Fit the 16:9 frame to the screen height so the whole video shows without scrolling. */}
          <div className="mx-auto w-full max-w-[calc((100svh-11rem)*16/9)]">
            {playbackUrl ? (
              <VideoPlayer url={playbackUrl} title={activeLesson.title} className="rounded-none" />
            ) : (
              <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/70">
                This video isn&apos;t available yet. Your instructor may still be uploading it.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 lg:py-8">
        <header className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Section {sectionIndex + 1} · Lesson {position.number} of {position.total}
            <span className="sr-only">: {section.title}</span>
          </p>
          <h1 className="font-heading text-2xl leading-tight font-semibold text-balance md:text-3xl">
            {activeLesson.title}
          </h1>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              {isVideo ? <PlayCircle className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
              {isVideo ? "Video" : "Article"}
            </li>
            {isVideo && activeLesson.durationSec ? (
              <li className="flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                <span className="font-mono">{formatLessonDuration(activeLesson.durationSec)}</span>
              </li>
            ) : null}
            {minutesToRead > 0 && (
              <li className="flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                {minutesToRead} min read
              </li>
            )}
            <li className="truncate">{section.title}</li>
          </ul>
        </header>

        {!isVideo && <LessonArticle text={activeLesson.content} className="mt-8" />}

        <LessonNavBar
          courseId={courseId}
          lessonId={activeLesson.id}
          watchedSeconds={activeLesson.durationSec ?? 0}
          previous={position.previous}
          next={position.next}
          completed={completed}
          firstUnfinished={firstUnfinished}
        />

        {lessonQuiz && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">Check your understanding: {lessonQuiz.title}</p>
                <p className="text-xs text-muted-foreground">
                  {lessonQuiz._count.questions} {lessonQuiz._count.questions === 1 ? "question" : "questions"}
                  {passedQuizIds.has(lessonQuiz.id) && " · Passed"}
                </p>
              </div>
            </div>
            <Button variant="outline" render={<Link href={`/student/quiz/${lessonQuiz.id}`} />}>
              {passedQuizIds.has(lessonQuiz.id) ? "Review quiz" : "Take the quiz"}
            </Button>
          </div>
        )}

        {progress.isComplete && certificate && (
          <CourseCompleteCard
            courseTitle={course.title}
            lessonCount={progress.totalLessons}
            certificate={certificate}
            pendingQuizzes={pendingQuizzes}
          />
        )}

        <Tabs defaultValue="overview" className="mt-10">
          <TabsList variant="line" className="w-full justify-start gap-4 border-b pb-px">
            <TabsTrigger value="overview" className="flex-none px-0.5">
              Overview
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-none px-0.5">
              Notes
              {note && <span className="size-1.5 rounded-full bg-amber" aria-label="(has notes)" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-6">
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="font-heading text-lg font-semibold">About this course</h2>
                {course.subtitle && <p className="text-muted-foreground">{course.subtitle}</p>}
              </div>
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {courseFacts.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
              <Link
                href={`/courses/${course.slug}`}
                className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                View the course page
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="notes" keepMounted className="pt-6">
            <LessonNotes
              key={activeLesson.id}
              lessonId={activeLesson.id}
              initialContent={note?.content ?? ""}
              initialUpdatedAt={note?.updatedAt.toISOString() ?? null}
            />
          </TabsContent>
        </Tabs>
      </div>
    </LearnShell>
  );
}
