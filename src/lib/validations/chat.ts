import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long"),
});

export const reportMessageSchema = z.object({
  messageId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
