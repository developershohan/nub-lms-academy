/*
 * Course communities: every course has #general (the course group as it has always been),
 * #announcements (instructors post, everyone reads) and #q-and-a, plus optional batch channels
 * ("Batch 7, Jan 2027") for cohort programmes. Instructors moderate: pin, slow mode, time out or
 * remove members. No next/* imports.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { rooms, type RealtimeBus } from "@/server/realtime/bus";
import { courseGroupRole, isStaff, postingPausedReason, type ChatUser, type ParticipantRole } from "./access";
import { findOrCreateConversation } from "./messages";

export type ChannelKind = "GENERAL" | "ANNOUNCEMENTS" | "QA" | "BATCH";

export const CHANNEL_LABELS: Record<ChannelKind, string> = {
  GENERAL: "#general",
  ANNOUNCEMENTS: "#announcements",
  QA: "#q-and-a",
  BATCH: "batch",
};

/** "course:<id>" for #general (its key from before channels existed), then ":announcements", ":qa", ":batch:<slug>". */
export const channelKey = (courseId: string, channel: ChannelKind, slug?: string) =>
  channel === "GENERAL"
    ? `course:${courseId}`
    : channel === "BATCH"
      ? `course:${courseId}:batch:${slug}`
      : `course:${courseId}:${channel === "QA" ? "qa" : "announcements"}`;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "batch";

export type Channel = {
  id: string;
  channel: ChannelKind;
  label: string;
  announcementOnly: boolean;
  slowModeSec: number;
  pinnedMessageId: string | null;
  lastSeq: number;
};

/** The course's standard channels, created on first use. #general keeps the historic "course:<id>" key. */
export async function ensureCourseChannels(courseId: string): Promise<Channel[]> {
  const standard: { channel: ChannelKind; announcementOnly: boolean }[] = [
    { channel: "GENERAL", announcementOnly: false },
    { channel: "ANNOUNCEMENTS", announcementOnly: true },
    { channel: "QA", announcementOnly: false },
  ];
  for (const { channel, announcementOnly } of standard) {
    const key = channelKey(courseId, channel);
    await findOrCreateConversation(key, () =>
      prisma.conversation.create({ data: { type: "COURSE_GROUP", courseId, uniqueKey: key, channel, announcementOnly } })
    );
  }
  // #general existed before channels did: give it its kind if the migration hasn't already.
  await prisma.conversation.updateMany({ where: { uniqueKey: channelKey(courseId, "GENERAL"), channel: null }, data: { channel: "GENERAL" } });
  return listCourseChannels(courseId);
}

export async function listCourseChannels(courseId: string): Promise<Channel[]> {
  const rows = await prisma.conversation.findMany({
    where: { type: "COURSE_GROUP", courseId, channel: { not: null } },
    select: { id: true, channel: true, title: true, announcementOnly: true, slowModeSec: true, pinnedMessageId: true, lastSeq: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const order: ChannelKind[] = ["GENERAL", "ANNOUNCEMENTS", "QA", "BATCH"];
  return rows
    .map((r) => ({
      id: r.id,
      channel: r.channel as ChannelKind,
      label: r.channel === "BATCH" ? (r.title ?? "Batch") : CHANNEL_LABELS[r.channel as ChannelKind],
      announcementOnly: r.announcementOnly,
      slowModeSec: r.slowModeSec,
      pinnedMessageId: r.pinnedMessageId,
      lastSeq: r.lastSeq,
    }))
    .sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel));
}

async function requireModerator(user: ChatUser, courseId: string) {
  if (isStaff(user)) return true;
  const role = await courseGroupRole(user.id, courseId);
  return role === "OWNER" || role === "MODERATOR";
}

/** A cohort channel, e.g. "Batch 7, Jan 2027". Members join it like any other channel. */
export async function createBatchChannel(user: ChatUser, courseId: string, label: string) {
  if (!(await requireModerator(user, courseId))) return { error: "Forbidden" } as const;
  const title = label.trim().slice(0, 60);
  if (!title) return { error: "Give the batch a name" } as const;
  const key = channelKey(courseId, "BATCH", slugify(title));
  const { id, created } = await findOrCreateConversation(key, () =>
    prisma.conversation.create({ data: { type: "COURSE_GROUP", courseId, uniqueKey: key, channel: "BATCH", title } })
  );
  if (!created) return { error: "A batch with that name already exists" } as const;
  await logAudit(user.id, "channel:create", "Conversation", id, { courseId, title });
  return { ok: true, conversationId: id } as const;
}

async function moderatedChannel(user: ChatUser, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { courseId: true, type: true } });
  if (!conversation || conversation.type !== "COURSE_GROUP" || !conversation.courseId) return null;
  return (await requireModerator(user, conversation.courseId)) ? conversation : null;
}

/** Pins a message to the top of the channel (null unpins). */
export async function pinMessage(bus: RealtimeBus, user: ChatUser, conversationId: string, messageId: string | null) {
  if (!(await moderatedChannel(user, conversationId))) return { error: "Forbidden" } as const;
  if (messageId) {
    const message = await prisma.message.findFirst({ where: { id: messageId, conversationId, deletedAt: null }, select: { id: true } });
    if (!message) return { error: "Message not found" } as const;
  }
  await prisma.conversation.update({ where: { id: conversationId }, data: { pinnedMessageId: messageId } });
  bus.emit(rooms.conversation(conversationId), "conversation:settings", { conversationId, pinnedMessageId: messageId });
  return { ok: true } as const;
}

/** Members may post once per `seconds` (0 turns it off); moderators are exempt. */
export async function setSlowMode(bus: RealtimeBus, user: ChatUser, conversationId: string, seconds: number) {
  if (!(await moderatedChannel(user, conversationId))) return { error: "Forbidden" } as const;
  const slowModeSec = Math.max(0, Math.min(Math.round(seconds), 3600));
  await prisma.conversation.update({ where: { id: conversationId }, data: { slowModeSec } });
  bus.invalidateUser("*");
  bus.emit(rooms.conversation(conversationId), "conversation:settings", { conversationId, slowModeSec });
  return { ok: true, slowModeSec } as const;
}

/** Stops a member posting in this channel until a time (null lifts it). They can still read. */
export async function timeoutMember(bus: RealtimeBus, user: ChatUser, conversationId: string, userId: string, until: Date | null) {
  const conversation = await moderatedChannel(user, conversationId);
  if (!conversation) return { error: "Forbidden" } as const;
  if (userId === user.id) return { error: "You can't time yourself out" } as const;
  const targetRole = await courseGroupRole(userId, conversation.courseId!);
  if (targetRole === "OWNER" || targetRole === "MODERATOR") return { error: "Instructors can't be timed out" } as const;
  const { count } = await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId, removedAt: null },
    data: { postingBlockedUntil: until },
  });
  if (count === 0) return { error: "Not a member of this channel" } as const;
  bus.invalidateUser(userId);
  bus.emit(rooms.user(userId), "conversation:updated", {
    conversationId,
    canPost: !until,
    postingBlockedReason: until ? postingPausedReason(until) : null,
  });
  await logAudit(user.id, until ? "channel:timeout" : "channel:timeout-lift", "Conversation", conversationId, { userId });
  return { ok: true } as const;
}

/**
 * Removes a member from a channel (their row is kept with removedAt, like a lost enrollment).
 * Membership reconciliation would add an enrolled student back, so this is for batch channels
 * and for members who shouldn't be in a channel until an instructor re-adds them.
 */
export async function removeMember(bus: RealtimeBus, user: ChatUser, conversationId: string, userId: string) {
  const conversation = await moderatedChannel(user, conversationId);
  if (!conversation) return { error: "Forbidden" } as const;
  const targetRole = await courseGroupRole(userId, conversation.courseId!);
  if (targetRole === "OWNER" || targetRole === "MODERATOR") return { error: "Instructors can't be removed" } as const;
  await prisma.conversationParticipant.updateMany({ where: { conversationId, userId, removedAt: null }, data: { removedAt: new Date(), removedById: user.id } });
  bus.invalidateUser(userId);
  bus.removeUserFromRoom(userId, rooms.conversation(conversationId));
  bus.emit(rooms.user(userId), "conversation:removed", { conversationId });
  await logAudit(user.id, "channel:remove-member", "Conversation", conversationId, { userId });
  return { ok: true } as const;
}

/** Puts a member (back) into a channel; a batch channel is filled this way. */
export async function addMember(bus: RealtimeBus, user: ChatUser, conversationId: string, userId: string) {
  const conversation = await moderatedChannel(user, conversationId);
  if (!conversation) return { error: "Forbidden" } as const;
  const role = await courseGroupRole(userId, conversation.courseId!);
  if (!role) return { error: "That person doesn't have access to this course" } as const;
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, role },
    update: { removedAt: null, removedById: null, role },
  });
  bus.invalidateUser(userId);
  bus.emit(rooms.user(userId), "conversation:added", { conversationId });
  return { ok: true } as const;
}

export type { ParticipantRole };
