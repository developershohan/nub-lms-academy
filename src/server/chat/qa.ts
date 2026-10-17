/*
 * Lesson Q&A: a searchable thread of questions per lesson, separate from chat. Students ask and
 * upvote; the course's teacher or a co-instructor answers and marks a question answered. No
 * next/* imports.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { NotifyInput } from "@/server/notifications/notify";
import { courseGroupRole, isStaff, type ChatUser } from "./access";

type Notify = (userIds: string[], input: NotifyInput) => Promise<unknown>;

const QUESTION_INCLUDE = {
  user: { select: { id: true, name: true } },
  lesson: { select: { id: true, title: true } },
} satisfies Prisma.LessonQuestionInclude;

export type QuestionSummary = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  title: string;
  body: string;
  upvotes: number;
  answerCount: number;
  answeredAt: string | null;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string | null };
  /** Whether the caller upvoted it. */
  voted: boolean;
};

export type AnswerSummary = {
  id: string;
  body: string;
  isInstructor: boolean;
  accepted: boolean;
  createdAt: string;
  author: { id: string; name: string | null };
};

type QuestionRow = Prisma.LessonQuestionGetPayload<{ include: typeof QUESTION_INCLUDE }>;

function toSummary(row: QuestionRow, voted: boolean): QuestionSummary {
  return {
    id: row.id,
    lessonId: row.lessonId,
    lessonTitle: row.lesson.title,
    courseId: row.courseId,
    title: row.title,
    body: row.body,
    upvotes: row.upvotes,
    answerCount: row.answerCount,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.user.id, name: row.user.name },
    voted,
  };
}

/** Can this user take part in the course's Q&A, and as what? */
export async function qaRole(user: ChatUser, courseId: string): Promise<"instructor" | "member" | null> {
  if (isStaff(user)) return "instructor";
  const role = await courseGroupRole(user.id, courseId);
  if (role === "OWNER" || role === "MODERATOR") return "instructor";
  return role ? "member" : null;
}

async function courseOfLesson(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, section: { select: { courseId: true, course: { select: { title: true, teacherId: true } } } } },
  });
  return lesson ? { lessonId: lesson.id, lessonTitle: lesson.title, courseId: lesson.section.courseId, course: lesson.section.course } : null;
}

export type QuestionFilter = { lessonId?: string; q?: string; unanswered?: boolean; sort?: "top" | "new" };

/** Questions for a course (optionally one lesson), top-voted or newest first, pinned ones first. */
export async function listQuestions(user: ChatUser, courseId: string, filter: QuestionFilter = {}) {
  if (!(await qaRole(user, courseId))) return { error: "Forbidden" } as const;
  const where: Prisma.LessonQuestionWhereInput = { courseId };
  if (filter.lessonId) where.lessonId = filter.lessonId;
  if (filter.unanswered) where.answeredAt = null;
  const q = filter.q?.trim();
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }];

  const rows = await prisma.lessonQuestion.findMany({
    where,
    include: QUESTION_INCLUDE,
    orderBy: filter.sort === "new" ? [{ pinned: "desc" }, { createdAt: "desc" }] : [{ pinned: "desc" }, { upvotes: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const votes = rows.length
    ? await prisma.lessonQuestionVote.findMany({ where: { userId: user.id, questionId: { in: rows.map((r) => r.id) } }, select: { questionId: true } })
    : [];
  const voted = new Set(votes.map((v) => v.questionId));
  return { ok: true, questions: rows.map((row) => toSummary(row, voted.has(row.id))) } as const;
}

export async function askQuestion(notify: Notify, user: ChatUser, lessonId: string, input: { title: string; body: string }) {
  const lesson = await courseOfLesson(lessonId);
  if (!lesson) return { error: "Lesson not found" } as const;
  if (!(await qaRole(user, lesson.courseId))) return { error: "Forbidden" } as const;
  const title = input.title.trim().slice(0, 160);
  const body = input.body.trim().slice(0, 4000);
  if (!title || !body) return { error: "Give your question a title and some detail" } as const;

  const row = await prisma.lessonQuestion.create({
    data: { lessonId, courseId: lesson.courseId, userId: user.id, title, body },
    include: QUESTION_INCLUDE,
  });
  // The teacher and co-instructors hear about it, collapsed per course.
  const instructors = await prisma.courseInstructor.findMany({ where: { courseId: lesson.courseId }, select: { userId: true } });
  await notify([lesson.course.teacherId, ...instructors.map((i) => i.userId)], {
    type: "lesson_question",
    title: `New question in ${lesson.course.title}`,
    body: `${user.name ?? "A student"} asked: ${title}`,
    link: `/teacher/questions?course=${lesson.courseId}`,
    actorId: user.id,
    entity: { type: "LessonQuestion", id: row.id },
    groupKey: `questions:${lesson.courseId}`,
  });
  return { ok: true, question: toSummary(row, false) } as const;
}

export async function getQuestion(user: ChatUser, questionId: string) {
  const row = await prisma.lessonQuestion.findUnique({ where: { id: questionId }, include: QUESTION_INCLUDE });
  if (!row) return { error: "Not found" } as const;
  if (!(await qaRole(user, row.courseId))) return { error: "Forbidden" } as const;
  const [answers, vote] = await Promise.all([
    prisma.lessonAnswer.findMany({
      where: { questionId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ accepted: "desc" }, { createdAt: "asc" }],
    }),
    prisma.lessonQuestionVote.findUnique({ where: { questionId_userId: { questionId, userId: user.id } }, select: { id: true } }),
  ]);
  return {
    ok: true,
    question: toSummary(row, !!vote),
    answers: answers.map(
      (a): AnswerSummary => ({
        id: a.id,
        body: a.body,
        isInstructor: a.isInstructor,
        accepted: a.accepted,
        createdAt: a.createdAt.toISOString(),
        author: { id: a.user.id, name: a.user.name },
      })
    ),
  } as const;
}

/** Adds or removes the caller's upvote. */
export async function toggleUpvote(user: ChatUser, questionId: string) {
  const question = await prisma.lessonQuestion.findUnique({ where: { id: questionId }, select: { courseId: true } });
  if (!question) return { error: "Not found" } as const;
  if (!(await qaRole(user, question.courseId))) return { error: "Forbidden" } as const;
  const key = { questionId_userId: { questionId, userId: user.id } };
  const existing = await prisma.lessonQuestionVote.findUnique({ where: key, select: { id: true } });
  const upvoted = !existing;
  await prisma.$transaction(
    existing
      ? [prisma.lessonQuestionVote.delete({ where: { id: existing.id } }), prisma.lessonQuestion.update({ where: { id: questionId }, data: { upvotes: { decrement: 1 } } })]
      : [prisma.lessonQuestionVote.create({ data: { questionId, userId: user.id } }), prisma.lessonQuestion.update({ where: { id: questionId }, data: { upvotes: { increment: 1 } } })]
  );
  const updated = await prisma.lessonQuestion.findUniqueOrThrow({ where: { id: questionId }, select: { upvotes: true } });
  return { ok: true, upvoted, upvotes: updated.upvotes } as const;
}

/** An answer. An instructor's answer marks the question answered and tells the asker. */
export async function answerQuestion(notify: Notify, user: ChatUser, questionId: string, body: string) {
  const question = await prisma.lessonQuestion.findUnique({ where: { id: questionId }, include: QUESTION_INCLUDE });
  if (!question) return { error: "Not found" } as const;
  const role = await qaRole(user, question.courseId);
  if (!role) return { error: "Forbidden" } as const;
  const text = body.trim().slice(0, 4000);
  if (!text) return { error: "Write an answer first" } as const;

  const isInstructor = role === "instructor";
  const [answer] = await prisma.$transaction([
    prisma.lessonAnswer.create({
      data: { questionId, userId: user.id, body: text, isInstructor, accepted: isInstructor && !question.acceptedAnswerId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.lessonQuestion.update({
      where: { id: questionId },
      data: { answerCount: { increment: 1 }, ...(isInstructor ? { answeredAt: question.answeredAt ?? new Date() } : {}) },
    }),
  ]);
  if (isInstructor && !question.acceptedAnswerId) {
    await prisma.lessonQuestion.update({ where: { id: questionId }, data: { acceptedAnswerId: answer.id } });
  }
  await notify([question.userId], {
    type: "question_answered",
    title: isInstructor ? `${user.name ?? "Your instructor"} answered your question` : `${user.name ?? "A classmate"} replied to your question`,
    body: `${question.title}: ${text.slice(0, 140)}`,
    link: `/student/course/${question.courseId}/questions?q=${questionId}`,
    actorId: user.id,
    entity: { type: "LessonQuestion", id: questionId },
    groupKey: `question:${questionId}`,
  });
  return {
    ok: true,
    answer: {
      id: answer.id,
      body: answer.body,
      isInstructor: answer.isInstructor,
      accepted: answer.accepted,
      createdAt: answer.createdAt.toISOString(),
      author: { id: answer.user.id, name: answer.user.name },
    } satisfies AnswerSummary,
  } as const;
}

/** Instructors (or the asker) accept an answer; instructors can also pin a question or clear "answered". */
export async function moderateQuestion(
  user: ChatUser,
  questionId: string,
  action: { acceptAnswerId: string } | { pinned: boolean } | { answered: boolean }
) {
  const question = await prisma.lessonQuestion.findUnique({ where: { id: questionId }, select: { courseId: true, userId: true } });
  if (!question) return { error: "Not found" } as const;
  const role = await qaRole(user, question.courseId);
  const instructor = role === "instructor";
  if ("acceptAnswerId" in action) {
    if (!instructor && question.userId !== user.id) return { error: "Forbidden" } as const;
    const answer = await prisma.lessonAnswer.findFirst({ where: { id: action.acceptAnswerId, questionId }, select: { id: true } });
    if (!answer) return { error: "Answer not found" } as const;
    await prisma.$transaction([
      prisma.lessonAnswer.updateMany({ where: { questionId }, data: { accepted: false } }),
      prisma.lessonAnswer.update({ where: { id: answer.id }, data: { accepted: true } }),
      prisma.lessonQuestion.update({ where: { id: questionId }, data: { acceptedAnswerId: answer.id, answeredAt: new Date() } }),
    ]);
    return { ok: true } as const;
  }
  if (!instructor) return { error: "Forbidden" } as const;
  if ("pinned" in action) await prisma.lessonQuestion.update({ where: { id: questionId }, data: { pinned: action.pinned } });
  else await prisma.lessonQuestion.update({ where: { id: questionId }, data: { answeredAt: action.answered ? new Date() : null } });
  return { ok: true } as const;
}

/** Courses a teacher can answer questions for, with their open-question counts. */
export async function teacherQuestionCourses(user: ChatUser) {
  const courses = await prisma.course.findMany({
    where: isStaff(user) ? {} : { OR: [{ teacherId: user.id }, { instructors: { some: { userId: user.id } } }] },
    select: { id: true, title: true, _count: { select: { lessonQuestions: { where: { answeredAt: null } } } } },
    orderBy: { title: "asc" },
    take: 200,
  });
  return courses.map((c) => ({ id: c.id, title: c.title, open: c._count.lessonQuestions }));
}
