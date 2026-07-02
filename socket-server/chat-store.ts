// Direct-DB persistence for the realtime hot path. This runs in a standalone Node process (not
// bundled by Next.js), so it cannot import src/lib/permissions.ts or src/server/services/*: those
// depend on "server-only" and next/cache, which only work inside a live Next.js request context.
// canAccessConversation below mirrors src/lib/permissions.ts's version - keep both in sync.
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/generated/prisma/client";

export async function getActiveUserWithRoles(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, name: user.name, roleNames: user.roles.map((r) => r.role.name) as RoleName[] };
}

export async function canAccessConversation(roleNames: RoleName[], userId: string, conversationId: string) {
  if (roleNames.includes("ADMIN") || roleNames.includes("SUPER_ADMIN")) return true;

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
    if (course.status !== "PUBLISHED") return false;

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: conversation.courseId } },
    });
    if (enrollment?.status === "ACTIVE") return true;

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

export async function persistMessage(conversationId: string, senderId: string, content: string) {
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId, content },
      include: { sender: { select: { id: true, name: true } } },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: senderId },
      data: { lastReadAt: new Date() },
    });
    return created;
  });

  const recipients = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId } },
    select: { userId: true },
  });
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.userId,
        type: "message",
        title: "New message",
        body: content.slice(0, 140),
      })),
    });
  }

  return { message, recipientIds: recipients.map((r) => r.userId) };
}

export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  const unread = await prisma.message.findMany({
    where: { conversationId, senderId: { not: userId } },
    select: { id: true },
  });
  if (unread.length) {
    await prisma.messageReadReceipt.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });
  }
}
