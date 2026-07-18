import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/generated/prisma/client";

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

export async function canAdminAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  return hasPermission(user.roles.map((r) => r.role.name), "admin:access");
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
  if (course.status !== "PUBLISHED") return false;

  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (enrollment?.status === "ACTIVE") return true;

  // Subscription access is live, not a one-time grant: it only holds while isSubscriptionIncluded
  // is true and the subscription is currently ACTIVE, so it disappears on its own if either lapses -
  // no Enrollment row is created for it, unlike a purchase or free enrollment.
  if (course.isSubscriptionIncluded) {
    const subscription = await prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" } });
    if (subscription) return true;
  }
  return false;
}

/** Preview lessons are visible to anyone (even signed out); everything else requires course access. */
export async function canAccessLesson(userId: string | null, lessonId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { isPreview: true, section: { select: { courseId: true, course: { select: { status: true } } } } },
  });
  if (!lesson || lesson.section.course.status !== "PUBLISHED") return false;
  if (lesson.isPreview) return true;
  if (!userId) return false;
  return canAccessCourse(userId, lesson.section.courseId);
}

/** Whether the student can start a NEW attempt (course access + under maxAttempts). Past attempts
 * always remain viewable regardless of this check. */
export async function canAttemptQuiz(userId: string, quizId: string): Promise<boolean> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { courseId: true, maxAttempts: true },
  });
  if (!quiz) return false;
  if (!(await canAccessCourse(userId, quiz.courseId))) return false;
  if (quiz.maxAttempts == null) return true;

  const submittedCount = await prisma.quizAttempt.count({
    where: { quizId, userId, status: "SUBMITTED" },
  });
  return submittedCount < quiz.maxAttempts;
}

/**
 * Enrolled + active + course published + every lesson completed + every quiz in the course
 * passed at least once. Whether a certificate already exists is an idempotency concern for the
 * generate step, not an eligibility one - this only answers "have they earned it".
 */
export async function canGenerateCertificate(userId: string, courseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return false;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { status: true } });
  if (!course || course.status !== "PUBLISHED") return false;

  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment || enrollment.status !== "ACTIVE" || !enrollment.completedAt) return false;

  const quizzes = await prisma.quiz.findMany({ where: { courseId }, select: { id: true } });
  if (quizzes.length === 0) return true;

  const passedQuizIds = await prisma.quizAttempt.findMany({
    where: { userId, status: "SUBMITTED", passed: true, quizId: { in: quizzes.map((q) => q.id) } },
    select: { quizId: true },
    distinct: ["quizId"],
  });
  return passedQuizIds.length === quizzes.length;
}

/**
 * COURSE_GROUP conversations aren't gated by a ConversationParticipant row (participants are
 * added lazily on first visit) - access there is derived live from course access instead, so a
 * student who was enrolled before ever opening the chat can still see the full history. DIRECT
 * and SUPPORT conversations require an actual participant row. Moderators (chat:moderate) can
 * always read, for the admin moderation view.
 */
export async function canAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  const roles = user.roles.map((r) => r.role.name);
  if (hasPermission(roles, "chat:moderate")) return true;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return false;

  if (conversation.type === "COURSE_GROUP") {
    return conversation.courseId ? canAccessCourse(userId, conversation.courseId) : false;
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return !!participant;
}
