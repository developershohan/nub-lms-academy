import { z } from "zod";

export const quizSettingsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1).optional().or(z.literal("").transform(() => undefined)),
  timeLimitSec: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)),
});

export const questionTypes = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] as const;

export const questionSchema = z.object({
  prompt: z.string().min(3, "Question prompt must be at least 3 characters"),
  type: z.enum(questionTypes),
  points: z.coerce.number().int().min(1),
  // One option per line; a leading "*" marks it correct. Ignored for TRUE_FALSE.
  options: z.string().optional(),
  trueFalseAnswer: z.enum(["true", "false"]).optional(),
});

export type QuizSettingsInput = z.infer<typeof quizSettingsSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
