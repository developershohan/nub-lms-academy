"use server";

import { auth } from "@/lib/auth";
import {
  startDirectConversation,
  startSupportConversation,
  getOrCreateCourseGroupConversation,
  markConversationRead,
  hideMessage,
  searchUsersToMessage,
  type ChatUserSearchResult,
} from "@/server/services/chat-service";
import { canModerateChat } from "@/lib/permissions";

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

/** Staff-only "chat with anyone" search - gated here rather than trusting the caller, since the
 * result set (name/email of any active user) is only appropriate for chat moderators. */
export async function searchUsersToMessageAction(
  query: string
): Promise<{ error: string } | { ok: true; results: ChatUserSearchResult[] }> {
  const userId = await requireUserId();
  if (!userId || !(await canModerateChat(userId))) return { error: "Forbidden" };

  const results = await searchUsersToMessage(query, userId);
  return { ok: true, results };
}
