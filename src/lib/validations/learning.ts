import { z } from "zod";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const progressSchema = z.object({
  watchedSeconds: z.coerce.number().int().min(0),
  completed: z.coerce.boolean().optional(),
});

export const LESSON_NOTE_MAX_LENGTH = 20_000;

export const lessonNoteSchema = z.object({
  lessonId: z.string().min(1, "Missing lesson"),
  content: z
    .string()
    .max(LESSON_NOTE_MAX_LENGTH, `Notes can be up to ${LESSON_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters`),
});

export const lessonViewSchema = z.object({ lessonId: z.string().min(1, "Missing lesson") });

export type ReviewInput = z.infer<typeof reviewSchema>;
export type ProgressInput = z.infer<typeof progressSchema>;
export type LessonNoteInput = z.infer<typeof lessonNoteSchema>;
