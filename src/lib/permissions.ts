import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoleHome } from "@/lib/role-home";
import { attemptBlock } from "@/lib/quiz-rules";
import type { RoleName } from "@/generated/prisma/client";
import { canAccessConversationAs, getChatUser } from "@/server/chat/access";

export type Permission =
  | "course:create"
  | "course:update-own"
  | "course:delete-own"
  | "course:submit-review"
  | "course:approve"
  | "course:reject"
  | "course:publish"
  | "teacher:approve"
  | "teacher:reject"
  | "user:ban"
  | "user:unban"
  | "coupon:create"
  | "coupon:update"
  | "coupon:delete"
  | "order:view"
  | "order:refund"
  | "chat:moderate"
  | "certificate:generate"
  | "admin:access";

const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  STUDENT: ["course:submit-review", "certificate:generate"],
  TEACHER: ["course:create", "course:update-own", "course:delete-own", "course:submit-review"],
  ADMIN: [
    "course:approve",
    "course:reject",
    "course:publish",
    "teacher:approve",
    "teacher:reject",
    "user:ban",
    "user:unban",
    "coupon:create",
    "coupon:update",
    "coupon:delete",
    "order:view",
    "order:refund",
    "chat:moderate",
    "admin:access",
  ],
  SUPER_ADMIN: [
    "course:approve",
    "course:reject",
    "course:publish",
    "teacher:approve",
    "teacher:reject",
    "user:ban",
    "user:unban",
    "coupon:create",
    "coupon:update",
    "coupon:delete",
    "order:view",
    "order:refund",
    "chat:moderate",
    "admin:access",
  ],
  // Handles Support conversations and message moderation only - never admin:access, so every
  // other admin page (users, courses, coupons, orders, ...) stays closed to this role.
  SUPPORT: ["chat:moderate"],
};

/** Re-checks status/roles against the DB instead of trusting stale JWT claims. */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    roles: user.roles.map((r) => r.role.name),
  };
}

/** Guest-only routes call this before rendering or mutating data. The database-backed user check
 * prevents an active session from reopening login/registration flows and avoids trusting stale
 * role or account-status claims from the JWT. */
export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();
  if (user) redirect(getRoleHome(user.roles));
}

export function hasRole(roles: RoleName[], role: RoleName) {
  return roles.includes(role);
}

export function hasPermission(roles: RoleName[], permission: Permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

/**
 * Layouts don't re-run their auth check on client-side navigation between sibling routes, so any
 * page rendering sensitive data must re-verify the current user itself rather than trusting the
 * parent layout alone - call this at the top of every admin page.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.roles, "admin:access")) redirect("/login");
  return user;
}

/** Same reasoning as requireAdmin - call at the top of every teacher-only page. */
export async function requireTeacher() {
  const user = await getCurrentUser();
  if (!user || !(hasRole(user.roles, "TEACHER") || hasRole(user.roles, "SUPER_ADMIN"))) redirect("/login");
  return user;
}

/** For the one admin page SUPPORT staff can also reach (message moderation) - broader than
 * requireAdmin (which checks admin:access, a permission SUPPORT deliberately lacks). */
export async function requireChatModerator() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.roles, "chat:moderate")) redirect("/login");
  return user;
}

export async function canAdminAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  return hasPermission(user.roles.map((r) => r.role.name), "admin:access");
}

/** ADMIN/SUPER_ADMIN and SUPPORT can all moderate chat - broader than canAdminAccess. */
export async function canModerateChat(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  return hasPermission(user.roles.map((r) => r.role.name), "chat:moderate");
}

/**
 * Course content (details/curriculum) is edited only by its owning teacher - not admins.
 * Admin's course powers are reviewing/publishing (see canAdminAccess), never content edits.
 */
export async function canManageCourse(userId: string, courseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  const roles = user.roles.map((r) => r.role.name);
  if (!hasRole(roles, "TEACHER")) return false;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  return course?.teacherId === userId;
}

/** Sub-instructors get chat/support access on their assigned course (see CourseInstructor) but
 * never content-edit rights - canManageCourse stays owning-teacher-only for that reason. */
export async function isSubInstructor(userId: string, courseId: string): Promise<boolean> {
  const row = await prisma.courseInstructor.findUnique({ where: { courseId_userId: { courseId, userId } } });
  return !!row;
}

/**
 * Learner-facing view access, not a mutation right - so unlike canManageCourse, admins (and the
 * owning teacher) may preview a course here for support/QA even without an Enrollment row.
 */
export async function canAccessCourse(userId: string, courseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  const roles = user.roles.map((r) => r.role.name);
  if (hasPermission(roles, "admin:access")) return true;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true, status: true, isSubscriptionIncluded: true },
  });
  if (!course) return false;
  if (course.teacherId === userId) return true;

  // An enrollment (purchase, free, coupon, admin grant) is checked before course status on
  // purpose: unpublishing or archiving takes a course out of the catalog for NEW students, never
  // away from the ones who already enrolled (and possibly paid) for it.
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (enrollment?.status === "ACTIVE") return true;
  if (course.status !== "PUBLISHED") return false;

  // Subscription access is live, not a one-time grant: it only holds while isSubscriptionIncluded
  // is true, the course is published and the subscription is currently ACTIVE, so it disappears on
  // its own if any of those lapse - no Enrollment row is created for it, unlike a purchase.
  if (course.isSubscriptionIncluded) {
    const subscription = await prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" } });
    if (subscription) return true;
  }
  return false;
}

/** Preview lessons of a published course are visible to anyone (even signed out); everything
 * else - including every lesson of an unpublished course - requires course access, which
 * enrolled students keep after an unpublish (see canAccessCourse). */
export async function canAccessLesson(userId: string | null, lessonId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { isPreview: true, section: { select: { courseId: true, course: { select: { status: true } } } } },
  });
  if (!lesson) return false;
  if (lesson.isPreview && lesson.section.course.status === "PUBLISHED") return true;
  if (!userId) return false;
  return canAccessCourse(userId, lesson.section.courseId);
}

/** Whether the student can start a NEW attempt: course access, a live (not archived) quiz, an
 * attempt left, and past any retake cooldown (see attemptBlock). Past attempts always remain
 * viewable regardless of this check. */
export async function canAttemptQuiz(userId: string, quizId: string): Promise<boolean> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true, maxAttempts: true, retakeCooldownMin: true, archivedAt: true },
  });
  if (!quiz || quiz.archivedAt) return false;
  if (!(await canAccessCourse(userId, quiz.courseId))) return false;

  const [submittedAttempts, last] = await Promise.all([
    prisma.quizAttempt.count({ where: { quizId, userId, status: "SUBMITTED" } }),
    prisma.quizAttempt.findFirst({
      where: { quizId, userId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),
  ]);
  return (
    attemptBlock({
      maxAttempts: quiz.maxAttempts,
      submittedAttempts,
      lastSubmittedAt: last?.submittedAt ?? null,
      cooldownMin: quiz.retakeCooldownMin,
    }) === null
  );
}

/**
 * Enrolled + active + every lesson completed + every quiz in the course passed at least once.
 * Course status is deliberately not checked: like lesson access, a student who enrolled keeps
 * the ability to finish (and certify) a course after it's unpublished or archived. Whether a
 * certificate already exists is an idempotency concern for the generate step, not an
 * eligibility one - this only answers "have they earned it".
 */
export async function canGenerateCertificate(userId: string, courseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return false;

  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment || enrollment.status !== "ACTIVE" || !enrollment.completedAt) return false;

  // A quiz with no questions can't be passed (its score is always 0), so it must not block the
  // certificate - only quizzes a student can actually take count toward eligibility.
  const quizzes = await prisma.quiz.findMany({
    where: { courseId, archivedAt: null, questions: { some: {} } },
    select: { id: true },
  });
  if (quizzes.length === 0) return true;

  const passedQuizIds = await prisma.quizAttempt.findMany({
    where: { userId, status: "SUBMITTED", passed: true, quizId: { in: quizzes.map((q) => q.id) } },
    select: { quizId: true },
    distinct: ["quizId"],
  });
  return passedQuizIds.length === quizzes.length;
}

/** Whether the user may read this conversation (DMs and support need a membership row; course
 * channels follow course access; staff may read anything). See resolveAccess for posting rights. */
export async function canAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  // One rule set for the web app and the socket server: src/server/chat/access.ts.
  const user = await getChatUser(userId);
  return !!user && (await canAccessConversationAs(user, conversationId));
}
