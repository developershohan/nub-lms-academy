import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long"),
  /** Picked by the browser per message, so a retried send can't post twice. */
  clientMsgId: z.string().min(1).max(64).optional(),
});

/** "I've read up to seq N" (default: everything). */
export const readMessagesSchema = z.object({
  conversationId: z.string().min(1),
  seq: z.number().int().min(0).optional(),
});

/** Reconnect catch-up: "the newest message I have is seq N". */
export const syncMessagesSchema = z.object({
  conversationId: z.string().min(1),
  lastSeq: z.number().int().min(0),
});

export const reportMessageSchema = z.object({
  messageId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
