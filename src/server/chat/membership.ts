/*
 * Course community membership follows course access. Participant rows exist so a member gets
 * unread counts and notifications for a channel before ever opening it; reconcile adds and removes
 * them as enrollments, teaching assignments and subscriptions change. No next/* imports.
 */
import { prisma } from "@/lib/prisma";
import { rooms, type RealtimeBus } from "@/server/realtime/bus";
import { courseGroupRole, type ParticipantRole } from "./access";
import { ensureCourseChannels } from "./channels";

const ROLE_RANK: Record<ParticipantRole, number> = { OWNER: 3, MODERATOR: 2, MEMBER: 1 };

/** Courses whose channels this user belongs in, from enrollments and teaching (not subscriptions -
 * subscribers join a course's channels when they first open one, so a subscription doesn't add hundreds). */
async function desiredCourseRoles(userId: string): Promise<Map<string, ParticipantRole>> {
  const [taught, assisted, enrolled] = await Promise.all([
    prisma.course.findMany({ where: { teacherId: userId, status: { in: ["PUBLISHED", "ARCHIVED"] } }, select: { id: true } }),
    prisma.courseInstructor.findMany({ where: { userId }, select: { courseId: true } }),
    prisma.enrollment.findMany({ where: { userId, status: "ACTIVE" }, select: { courseId: true } }),
  ]);
  const desired = new Map<string, ParticipantRole>();
  const put = (courseId: string, role: ParticipantRole) => {
    const current = desired.get(courseId);
    if (!current || ROLE_RANK[role] > ROLE_RANK[current]) desired.set(courseId, role);
  };
  enrolled.forEach((e) => put(e.courseId, "MEMBER"));
  assisted.forEach((a) => put(a.courseId, "MODERATOR"));
  taught.forEach((c) => put(c.id, "OWNER"));
  return desired;
}

/**
 * Brings one user's course-channel rows in line with their access: joins the standard channels of
 * courses they teach, assist or are enrolled in, and removes them (removedAt, so their read
 * position survives a re-enrollment) from channels they can no longer reach - after a refund, a
 * revocation, a dispute or an expired subscription. Removed users leave the live room at once.
 */
export async function reconcileCourseGroups(bus: RealtimeBus, userId: string): Promise<{ added: string[]; removed: string[] }> {
  const desired = await desiredCourseRoles(userId);
  const existing = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { type: "COURSE_GROUP" } },
    select: { id: true, role: true, removedAt: true, removedById: true, conversationId: true, conversation: { select: { courseId: true, channel: true } } },
  });
  const byConversation = new Map(existing.map((p) => [p.conversationId, p]));
  const added: string[] = [];
  const removed: string[] = [];

  for (const [courseId, role] of desired) {
    for (const channel of await ensureCourseChannels(courseId)) {
      // Batch channels are filled by instructors, not by enrollment.
      if (channel.channel === "BATCH") continue;
      const row = byConversation.get(channel.id);
      if (!row) {
        await prisma.conversationParticipant.createMany({ data: [{ conversationId: channel.id, userId, role }], skipDuplicates: true });
        added.push(channel.id);
      } else if (row.removedAt || row.role !== role) {
        // A moderator's removal from a standard channel holds; a removal for lost access (refund,
        // revocation, lapsed subscription) is undone as soon as access is back.
        if (row.removedAt && row.removedById && row.role === role) continue;
        await prisma.conversationParticipant.update({ where: { id: row.id }, data: { removedAt: null, removedById: null, role } });
        if (row.removedAt) added.push(row.conversationId);
      }
    }
  }

  const stillAllowed = new Map<string, boolean>();
  for (const row of existing) {
    const courseId = row.conversation.courseId as string;
    if (row.removedAt || desired.has(courseId)) continue;
    // Not from an enrollment or teaching - a subscriber who opened the channel. Still allowed?
    if (!stillAllowed.has(courseId)) stillAllowed.set(courseId, !!(await courseGroupRole(userId, courseId)));
    if (stillAllowed.get(courseId)) continue;
    await prisma.conversationParticipant.update({ where: { id: row.id }, data: { removedAt: new Date(), removedById: null } });
    removed.push(row.conversationId);
  }

  if (added.length || removed.length) bus.invalidateUser(userId);
  for (const conversationId of removed) {
    bus.removeUserFromRoom(userId, rooms.conversation(conversationId));
    bus.emit(rooms.user(userId), "conversation:removed", { conversationId });
  }
  for (const conversationId of added) bus.emit(rooms.user(userId), "conversation:added", { conversationId });
  return { added, removed };
}

const lastReconciled = new Map<string, number>();
const RECONCILE_EVERY_MS = 60_000;

/** reconcileCourseGroups at most once a minute per user per process - for page loads. */
export async function reconcileCourseGroupsThrottled(bus: RealtimeBus, userId: string) {
  const now = Date.now();
  if (now - (lastReconciled.get(userId) ?? 0) < RECONCILE_EVERY_MS) return;
  lastReconciled.set(userId, now);
  if (lastReconciled.size > 10_000) lastReconciled.clear();
  await reconcileCourseGroups(bus, userId);
}

/**
 * Periodic sweep (worker): members of course channels who no longer have an active enrollment and
 * aren't teaching staff - mostly lapsed subscriptions, which have no event of their own.
 */
export async function sweepCourseGroupMembership(bus: RealtimeBus): Promise<number> {
  const candidates = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT p."userId"
    FROM "ConversationParticipant" p
    JOIN "Conversation" c ON c."id" = p."conversationId"
    WHERE c."type" = 'COURSE_GROUP' AND p."removedAt" IS NULL AND p."role" = 'MEMBER'
      AND NOT EXISTS (
        SELECT 1 FROM "Enrollment" e
        WHERE e."userId" = p."userId" AND e."courseId" = c."courseId" AND e."status" = 'ACTIVE'
      )
    LIMIT 5000`;
  let removed = 0;
  for (const { userId } of candidates) removed += (await reconcileCourseGroups(bus, userId)).removed.length;
  return removed;
}

/** For services that change enrollments (refunds, disputes, grants): reconcile each affected user. */
export async function syncCourseMembership(bus: RealtimeBus, userIds: string[]) {
  for (const userId of new Set(userIds)) {
    try {
      await reconcileCourseGroups(bus, userId);
    } catch (err) {
      // Membership is re-checked on every inbox load and by the worker's sweep; never fail a payment flow over it.
      console.error("Course channel membership sync failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
}
