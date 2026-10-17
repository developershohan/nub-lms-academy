"use server";

import { auth } from "@/lib/auth";
import { realtimeBus } from "@/lib/realtime";
import { getChatUser } from "@/server/chat/access";
import { addMember, createBatchChannel, pinMessage, removeMember, setSlowMode, timeoutMember } from "@/server/chat/channels";
import { listSupportStaff } from "@/server/chat/support";
import {
  blockUserForChat,
  deleteOwnMessage,
  editOwnMessage,
  getConversationSummary,
  getOrCreateCourseGroupConversation,
  hideMessage,
  markConversationRead,
  reactToMessage,
  reportMessage,
  resolveMessageReport,
  searchUsersToMessage,
  setConversationMuted,
  startDirectConversation,
  startSupportConversation,
  unblockUserForChat,
  updateSupportTicket,
  type ChatUserSearchResult,
} from "@/server/services/chat-service";
import { canModerateChat } from "@/lib/permissions";
import type { ChannelKind } from "@/server/chat/channels";
import type { TicketUpdate } from "@/server/chat/support";

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const NOT_AUTHENTICATED = { error: "Not authenticated" } as const;

export async function startDirectConversationAction(otherUserId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return startDirectConversation(userId, otherUserId);
}

export async function startCourseGroupConversationAction(courseId: string, channel: ChannelKind = "GENERAL") {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return getOrCreateCourseGroupConversation(userId, courseId, channel);
}

export async function startSupportConversationAction() {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return startSupportConversation(userId);
}

export async function getConversationSummaryAction(conversationId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return getConversationSummary(userId, conversationId);
}

export async function markConversationReadAction(conversationId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return markConversationRead(userId, conversationId);
}

/** A moderator of the conversation removes someone else's message. */
export async function hideMessageAction(messageId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return hideMessage(userId, messageId);
}

export async function editMessageAction(messageId: string, content: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return editOwnMessage(userId, messageId, content);
}

export async function deleteMessageAction(messageId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return deleteOwnMessage(userId, messageId);
}

export async function reactToMessageAction(messageId: string, emoji: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return reactToMessage(userId, messageId, emoji);
}

export async function reportMessageAction(messageId: string, reason: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return reportMessage(userId, messageId, reason.trim().slice(0, 300) || undefined);
}

export async function blockUserAction(targetId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return blockUserForChat(userId, targetId);
}

export async function unblockUserAction(targetId: string) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return unblockUserForChat(userId, targetId);
}

/** hours: how long to mute for; null unmutes. */
export async function muteConversationAction(conversationId: string, hours: number | null) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  const until = hours ? new Date(Date.now() + Math.min(Math.max(hours, 1), 24 * 365) * 3600 * 1000) : null;
  return setConversationMuted(userId, conversationId, until);
}

export async function updateTicketAction(ticketId: string, patch: TicketUpdate) {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return updateSupportTicket(userId, ticketId, patch);
}

export async function resolveReportAction(reportId: string, action: "remove" | "dismiss") {
  const userId = await requireUserId();
  if (!userId) return NOT_AUTHENTICATED;
  return resolveMessageReport(userId, reportId, action);
}

export async function listSupportStaffAction() {
  const userId = await requireUserId();
  if (!userId || !(await canModerateChat(userId))) return { error: "Forbidden" } as const;
  return { ok: true, staff: await listSupportStaff() } as const;
}

async function requireChatUser() {
  const userId = await requireUserId();
  return userId ? getChatUser(userId) : null;
}

export async function createBatchChannelAction(courseId: string, label: string) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  return createBatchChannel(user, courseId, label);
}

export async function pinMessageAction(conversationId: string, messageId: string | null) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  return pinMessage(realtimeBus, user, conversationId, messageId);
}

export async function setSlowModeAction(conversationId: string, seconds: number) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  return setSlowMode(realtimeBus, user, conversationId, seconds);
}

/** minutes: how long the member can't post; null lifts it. */
export async function timeoutMemberAction(conversationId: string, targetId: string, minutes: number | null) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  const until = minutes ? new Date(Date.now() + Math.min(Math.max(minutes, 1), 60 * 24 * 30) * 60_000) : null;
  return timeoutMember(realtimeBus, user, conversationId, targetId, until);
}

export async function removeMemberAction(conversationId: string, targetId: string) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  return removeMember(realtimeBus, user, conversationId, targetId);
}

export async function addMemberAction(conversationId: string, targetId: string) {
  const user = await requireChatUser();
  if (!user) return NOT_AUTHENTICATED;
  return addMember(realtimeBus, user, conversationId, targetId);
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
