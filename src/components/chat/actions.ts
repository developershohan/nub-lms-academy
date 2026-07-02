"use server";

import { auth } from "@/lib/auth";
import {
  startDirectConversation,
  startSupportConversation,
  getOrCreateCourseGroupConversation,
  markConversationRead,
  hideMessage,
} from "@/server/services/chat-service";

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function startDirectConversationAction(otherUserId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return startDirectConversation(userId, otherUserId);
}

export async function startCourseGroupConversationAction(courseId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return getOrCreateCourseGroupConversation(userId, courseId);
}

export async function startSupportConversationAction() {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return startSupportConversation(userId);
}

export async function markConversationReadAction(conversationId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return markConversationRead(userId, conversationId);
}

export async function hideMessageAction(messageId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return hideMessage(userId, messageId);
}
