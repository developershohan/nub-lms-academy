// Direct-DB persistence for the realtime hot path. This runs in a standalone Node process (not
// bundled by Next.js), so it cannot import src/lib/permissions.ts or src/server/services/*: those
// depend on "server-only" and next/cache, which only work inside a live Next.js request context.
// canAccessConversation below mirrors src/lib/permissions.ts's version - keep both in sync.
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/generated/prisma/client";
import { sendChatMessage } from "@/server/chat/messages";

export async function getActiveUserWithRoles(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, name: user.name, roleNames: user.roles.map((r) => r.role.name) as RoleName[] };
}

// Mirrors ROLE_PERMISSIONS' "chat:moderate" in src/lib/permissions.ts - SUPPORT staff answer
// SUPPORT tickets over the socket, so they need the same blanket access admins have.
const CHAT_MODERATOR_ROLES: RoleName[] = ["ADMIN", "SUPER_ADMIN", "SUPPORT"];

export async function canAccessConversation(roleNames: RoleName[], userId: string, conversationId: string) {
  if (roleNames.some((role) => CHAT_MODERATOR_ROLES.includes(role))) return true;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return false;

  if (conversation.type === "COURSE_GROUP") {
    if (!conversation.courseId) return false;
    const course = await prisma.course.findUnique({
      where: { id: conversation.courseId },
      select: { teacherId: true, status: true, isSubscriptionIncluded: true },
    });
    if (!course) return false;
    if (course.teacherId === userId) return true;

    // Enrollment before status, as in canAccessCourse: enrolled students keep course chat after
    // an unpublish/archive; only subscription access requires the course to still be published.
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: conversation.courseId } },
    });
    if (enrollment?.status === "ACTIVE") return true;
    if (course.status !== "PUBLISHED") return false;

    if (course.isSubscriptionIncluded) {
      const subscription = await prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" } });
      if (subscription) return true;
    }
    return false;
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return !!participant;
}

/** Sends through the shared chat module (seq, idempotent clientMsgId), then leaves one "new
 * message" notification per recipient. */
export async function persistMessage(conversationId: string, senderId: string, content: string, clientMsgId?: string) {
  const result = await sendChatMessage({ conversationId, senderId, content, clientMsgId });
  if ("error" in result) return result;

  if (!result.duplicate && result.recipients.length) {
    await prisma.notification.createMany({
      data: result.recipients.map((r) => ({
        userId: r.userId,
        type: "message",
        title: "New message",
        body: content.slice(0, 140),
      })),
    });
  }
  return result;
}

export { markChatRead, listMessagesAfter } from "@/server/chat/messages";
