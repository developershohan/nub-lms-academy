import { z } from "zod";
import { optionalNumber } from "@/lib/validations/common";

export const quizSettingsSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().optional(),
    passingScore: z.coerce.number().int().min(0).max(100),
    // Blank = unlimited / no time limit (see optionalNumber - "" must never coerce to 0).
    maxAttempts: optionalNumber(z.coerce.number().int().min(1, "Max attempts must be at least 1")),
    timeLimitSec: optionalNumber(z.coerce.number().int().min(1, "Time limit must be at least 1 second")),
    /** The studio's minutes field. When sent it wins over timeLimitSec; blank means no limit. */
    timeLimitMin: optionalNumber(
      z.coerce.number().min(1, "Time limit must be at least 1 minute").max(600, "Keep the time limit under 10 hours")
    ),
    drawCount: optionalNumber(z.coerce.number().int().min(1, "Draw at least 1 question per attempt")),
    retakeCooldownMin: optionalNumber(
      z.coerce.number().int().min(1, "Cooldown must be at least 1 minute").max(10_080, "Keep the cooldown under a week")
    ),
    // Checkboxes: "on" when ticked, absent when not.
    shuffleQuestions: z.coerce.boolean().optional(),
    shuffleOptions: z.coerce.boolean().optional(),
    partialCredit: z.coerce.boolean().optional(),
  })
  .transform(({ timeLimitMin, ...settings }) =>
    timeLimitMin === undefined ? settings : { ...settings, timeLimitSec: Math.round(timeLimitMin * 60) }
  );

export const questionTypes = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "ORDERING"] as const;

export const questionSchema = z.object({
  prompt: z.string().min(3, "Question prompt must be at least 3 characters"),
  type: z.enum(questionTypes),
  points: z.coerce.number().int().min(1),
  // One per line. Choice questions: a leading "*" marks a correct option. Fill in the blank: the
  // accepted answers. Ordering: the items in their correct order. Ignored for TRUE_FALSE.
  options: z.string().optional(),
  trueFalseAnswer: z.enum(["true", "false"]).optional(),
});

export type QuizSettingsInput = z.infer<typeof quizSettingsSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
