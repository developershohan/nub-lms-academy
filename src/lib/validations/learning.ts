import { z } from "zod";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const progressSchema = z.object({
  watchedSeconds: z.coerce.number().int().min(0),
  completed: z.coerce.boolean().optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
export type ProgressInput = z.infer<typeof progressSchema>;
