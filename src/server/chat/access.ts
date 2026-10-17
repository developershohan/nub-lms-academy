/*
 * Who may read, post in and moderate each conversation. The one copy of these rules: the Next.js
 * app (src/lib/permissions.ts, chat-service.ts) and the socket server (chat-store.ts) all call
 * resolveAccess, so they can no longer drift apart. No next/* or "server-only" imports.
 */
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/generated/prisma/client";

/** Staff who answer support and moderate chat everywhere (mirrors "chat:moderate" in permissions.ts). */
export const STAFF_ROLES: RoleName[] = ["ADMIN", "SUPER_ADMIN", "SUPPORT"];

export type ChatUser = { id: string; name: string | null; roleNames: RoleName[] };
export type ParticipantRole = "OWNER" | "MODERATOR" | "MEMBER";
export type BlockState = "none" | "by_me" | "by_them";

export const isStaff = (user: Pick<ChatUser, "roleNames">) => user.roleNames.some((r) => STAFF_ROLES.includes(r));

/** Relative on purpose: the server's clock and locale (UTC on a host) aren't the reader's. */
export function postingPausedReason(until: Date, now = Date.now()) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now) / 60_000));
  const left = minutes < 90 ? `${minutes} more minute${minutes === 1 ? "" : "s"}` : `about ${Math.round(minutes / 60)} more hours`;
  return `A moderator paused your posting for ${left}.`;
}

/** Re-reads status and roles from the database: a banned or demoted user must not keep chatting. */
export async function getChatUser(userId: string): Promise<ChatUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, status: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, name: user.name, roleNames: user.roles.map((r) => r.role.name) };
}

export type ConversationAccess =
  | { ok: false; reason: "not_found" | "forbidden" }
  | {
      ok: true;
      conversation: {
        id: string;
        type: "DIRECT" | "COURSE_GROUP" | "SUPPORT";
        courseId: string | null;
        channel: "GENERAL" | "ANNOUNCEMENTS" | "QA" | "BATCH" | null;
        lastSeq: number;
        slowModeSec: number;
      };
      /** The caller's role in it; null for staff looking in from outside. */
      role: ParticipantRole | null;
      isParticipant: boolean;
      lastReadSeq: number;
      mutedUntil: Date | null;
      canPost: boolean;
      /** Why not, when canPost is false - shown in the composer. */
      postingBlockedReason: string | null;
      canModerate: boolean;
      blocked: BlockState;
      /** The other person, for DIRECT conversations. */
      otherUserId: string | null;
    };

/**
 * A course community's channels follow course access, not stored rows: the teacher owns them,
 * co-instructors moderate, actively enrolled students (or subscribers, for subscription-included
 * published courses) are members. Enrollment is checked before course status, as in
 * canAccessCourse: students keep their channels after an unpublish.
 */
export async function courseGroupRole(userId: string, courseId: string): Promise<ParticipantRole | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      teacherId: true,
      status: true,
      isSubscriptionIncluded: true,
      instructors: { where: { userId }, select: { id: true } },
      enrollments: { where: { userId }, select: { status: true } },
    },
  });
  if (!course) return null;
  if (course.teacherId === userId) return "OWNER";
  if (course.instructors.length > 0) return "MODERATOR";
  if (course.enrollments[0]?.status === "ACTIVE") return "MEMBER";
  if (course.status === "PUBLISHED" && course.isSubscriptionIncluded) {
    const subscription = await prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (subscription) return "MEMBER";
  }
  return null;
}

export async function blockStateBetween(userId: string, otherUserId: string): Promise<BlockState> {
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { blockerId: true },
  });
  if (blocks.some((b) => b.blockerId === userId)) return "by_me";
  if (blocks.length > 0) return "by_them";
  return "none";
}

export async function resolveAccess(user: ChatUser, conversationId: string): Promise<ConversationAccess> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      type: true,
      courseId: true,
      channel: true,
      lastSeq: true,
      announcementOnly: true,
      slowModeSec: true,
      participants: {
        where: { userId: user.id },
        select: { role: true, lastReadSeq: true, removedAt: true, mutedUntil: true, postingBlockedUntil: true },
      },
      supportTicket: { select: { status: true } },
    },
  });
  if (!conversation) return { ok: false, reason: "not_found" };

  const staff = isStaff(user);
  const me = conversation.participants[0];
  const active = me && !me.removedAt ? me : null;
  const base = {
    ok: true as const,
    conversation: {
      id: conversation.id,
      type: conversation.type,
      courseId: conversation.courseId,
      channel: conversation.channel,
      lastSeq: conversation.lastSeq,
      slowModeSec: conversation.slowModeSec,
    },
    isParticipant: !!active,
    lastReadSeq: active?.lastReadSeq ?? 0,
    mutedUntil: active?.mutedUntil ?? null,
    postingBlockedReason: null as string | null,
    blocked: "none" as BlockState,
    otherUserId: null as string | null,
  };

  if (conversation.type === "DIRECT") {
    if (active) {
      const other = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: { not: user.id } },
        select: { userId: true },
      });
      const blocked = other ? await blockStateBetween(user.id, other.userId) : "none";
      return {
        ...base,
        role: active.role,
        canPost: blocked === "none" && !!other,
        postingBlockedReason:
          blocked === "by_me"
            ? "You blocked this person. Unblock them to send messages."
            : blocked === "by_them"
              ? "You can't reply to this conversation."
              : null,
        canModerate: false,
        blocked,
        otherUserId: other?.userId ?? null,
      };
    }
    // Staff may read a DM for moderation (a report), but never post into someone else's chat.
    if (staff) return { ...base, role: null, canPost: false, postingBlockedReason: "Staff can read this conversation but not post in it.", canModerate: true };
    return { ok: false, reason: "forbidden" };
  }

  if (conversation.type === "SUPPORT") {
    if (active) return { ...base, role: active.role, canPost: true, canModerate: false };
    if (staff) return { ...base, role: null, canPost: true, canModerate: true };
    return { ok: false, reason: "forbidden" };
  }

  // COURSE_GROUP: one of a course community's channels.
  const role = conversation.courseId ? await courseGroupRole(user.id, conversation.courseId) : null;
  if (!role && !staff) return { ok: false, reason: "forbidden" };
  const moderator = staff || role === "OWNER" || role === "MODERATOR";
  let postingBlockedReason: string | null = null;
  if (conversation.announcementOnly && !moderator) postingBlockedReason = "Only instructors post in #announcements.";
  else if (active?.postingBlockedUntil && active.postingBlockedUntil.getTime() > Date.now() && !moderator) {
    postingBlockedReason = postingPausedReason(active.postingBlockedUntil);
  }
  return {
    ...base,
    role,
    isParticipant: !!active,
    canPost: postingBlockedReason === null,
    postingBlockedReason,
    canModerate: moderator,
  };
}

/** Yes/no access for callers that only need that (permissions.ts, the socket server). */
export async function canAccessConversationAs(user: ChatUser, conversationId: string) {
  return (await resolveAccess(user, conversationId)).ok;
}

/**
 * Whether two people may start a DM: either side is staff (anyone can reach support, and staff
 * can reach anyone), or a course connects them - teacher and their student, classmates in the
 * same course, a co-instructor and that course's teacher or students. A block either way stops it.
 */
export async function canStartDirect(user: ChatUser, otherUserId: string): Promise<{ ok: true } | { error: string }> {
  if (user.id === otherUserId) return { error: "Cannot message yourself" };
  const other = await getChatUser(otherUserId);
  if (!other) return { error: "User not found" };

  if ((await blockStateBetween(user.id, otherUserId)) !== "none") return { error: "You can't message this person" };
  if (isStaff(user) || isStaff(other)) return { ok: true };

  const userId = user.id;
  const sharedEnrollment = await prisma.enrollment.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        // teacher <-> their student, either direction
        { userId, course: { teacherId: otherUserId } },
        { userId: otherUserId, course: { teacherId: userId } },
        // classmate <-> classmate: both actively enrolled in the same course
        { userId, course: { enrollments: { some: { userId: otherUserId, status: "ACTIVE" } } } },
      ],
    },
    select: { id: true },
  });
  if (sharedEnrollment) return { ok: true };

  const viaSubInstructor = await prisma.courseInstructor.findFirst({
    where: {
      OR: [
        { userId: otherUserId, course: { teacherId: userId } },
        { userId, course: { teacherId: otherUserId } },
        { userId, course: { enrollments: { some: { userId: otherUserId, status: "ACTIVE" } } } },
        { userId: otherUserId, course: { enrollments: { some: { userId, status: "ACTIVE" } } } },
      ],
    },
    select: { id: true },
  });
  if (viaSubInstructor) return { ok: true };

  return { error: "You can only message people connected to your courses" };
}
