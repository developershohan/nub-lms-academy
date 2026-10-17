import { z } from "zod";

const id = z.string().min(1).max(64);

export const sendMessageSchema = z.object({
  conversationId: id,
  content: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long"),
  /** Picked by the browser per message, so a retried send can't post twice. */
  clientMsgId: z.string().min(1).max(64).optional(),
  replyToId: id.nullish(),
});

export const editMessageSchema = z.object({
  messageId: id,
  content: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long"),
});

export const messageIdSchema = z.object({ messageId: id });

export const reactMessageSchema = z.object({ messageId: id, emoji: z.string().min(1).max(8) });

/** "I've read up to seq N" (default: everything). */
export const readMessagesSchema = z.object({
  conversationId: id,
  seq: z.number().int().min(0).optional(),
});

/** Reconnect catch-up: "the newest message I have is seq N", and when I last synced. */
export const syncMessagesSchema = z.object({
  conversationId: id,
  lastSeq: z.number().int().min(0),
  since: z.iso.datetime().nullish(),
});

export const reportMessageSchema = z.object({
  messageId: id,
  reason: z.string().trim().max(300).optional(),
});

export const ticketUpdateSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  /** null unassigns. */
  assigneeId: id.nullable().optional(),
});

export const askQuestionSchema = z.object({
  lessonId: id,
  title: z.string().trim().min(3, "Give your question a title").max(160),
  body: z.string().trim().min(1, "Add some detail").max(4000),
});

export const answerQuestionSchema = z.object({
  questionId: id,
  body: z.string().trim().min(1, "Write an answer first").max(4000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
export type TicketUpdateInput = z.infer<typeof ticketUpdateSchema>;
