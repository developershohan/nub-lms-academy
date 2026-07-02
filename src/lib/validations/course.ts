import { z } from "zod";

export const courseLevels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const;

export const courseDetailsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  level: z.enum(courseLevels),
  language: z.string().min(1, "Language is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  salePrice: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  targetAudience: z.string().optional(),
  requirements: z.string().optional(),
  outcomes: z.string().optional(),
});

export const sectionSchema = z.object({
  title: z.string().min(2, "Section title must be at least 2 characters"),
});

export const lessonSchema = z
  .object({
    title: z.string().min(2, "Lesson title must be at least 2 characters"),
    type: z.enum(["VIDEO", "TEXT"]),
    content: z.string().optional(),
    videoUrl: z.string().url("Enter a valid video URL").optional().or(z.literal("")),
    durationSec: z.coerce.number().int().min(0).optional(),
    isPreview: z.coerce.boolean().optional(),
  })
  .refine((data) => data.type !== "VIDEO" || !!data.videoUrl, {
    message: "Video URL is required for video lessons",
    path: ["videoUrl"],
  });

export const rejectCourseSchema = z.object({
  reason: z.string().min(3, "Give a reason for the rejection"),
});

export const categorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters"),
});

export type CourseDetailsInput = z.infer<typeof courseDetailsSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
