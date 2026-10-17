import { z } from "zod";
import { optionalNumber } from "@/lib/validations/common";

export const quizSettingsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100),
  // Blank = unlimited / no time limit (see optionalNumber - "" must never coerce to 0).
  maxAttempts: optionalNumber(z.coerce.number().int().min(1, "Max attempts must be at least 1")),
  timeLimitSec: optionalNumber(z.coerce.number().int().min(1, "Time limit must be at least 1 second")),
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
