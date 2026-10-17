// Direct-DB persistence for the realtime hot path. This runs in a standalone Node process (not
// bundled by Next.js), so it cannot import src/lib/permissions.ts or src/server/services/*: those
// depend on "server-only" and next/cache, which only work inside a live Next.js request context.
// Access rules come from src/server/chat/access.ts, the same module permissions.ts delegates to.
import type { RoleName } from "@/generated/prisma/client";
import { getChatUser, resolveAccess, type ChatUser, type ConversationAccess } from "@/server/chat/access";
import { sendChatMessage } from "@/server/chat/messages";

export async function getActiveUserWithRoles(userId: string): Promise<ChatUser | null> {
  return getChatUser(userId);
}

/** Full access details (post rights, moderation, read position) for a user and conversation. */
export function accessFor(user: ChatUser, conversationId: string): Promise<ConversationAccess> {
  return resolveAccess(user, conversationId);
}

/** Yes/no read access. Kept for callers that only know the role names and id. */
export async function canAccessConversation(roleNames: RoleName[], userId: string, conversationId: string) {
  return (await resolveAccess({ id: userId, name: null, roleNames }, conversationId)).ok;
}

/** Sends through the shared chat module (seq, idempotent clientMsgId). Notifications are the
 * caller's job (events/chat.events.ts), since it knows who is looking at the conversation. */
export function persistMessage(
  conversationId: string,
  senderId: string,
  content: string,
  clientMsgId?: string,
  replyToId?: string | null
) {
  return sendChatMessage({ conversationId, senderId, content, clientMsgId, replyToId });
}

export {
  editChatMessage,
  latestPreview,
  listMessagesAfter,
  markChatRead,
  memberIds,
  removeChatMessage,
  toggleReaction,
} from "@/server/chat/messages";
