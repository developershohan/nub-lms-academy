import { z } from "zod";
import { optionalNumber } from "@/lib/validations/common";
import { parseLessonDuration } from "@/lib/format";
import { parseYouTubeUrl } from "@/lib/youtube";

export const courseLevels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const;

const priceFields = {
  price: z.coerce.number().min(0, "Price cannot be negative"),
  // Blank = no sale. A sale price is what checkout charges (salePrice ?? price), so it must be
  // strictly below the regular price - an explicit 0 still means "free while on sale".
  salePrice: optionalNumber(z.coerce.number().min(0, "Sale price cannot be negative")),
};
const saleBelowPrice = (data: { price: number; salePrice?: number }) =>
  data.salePrice === undefined || data.salePrice < data.price;
const saleBelowPriceError = { message: "Sale price must be lower than the regular price", path: ["salePrice"] };

/** Everything at once - the REST API's PATCH /api/v1/courses/:id. The studio saves one part at a time. */
export const courseDetailsSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters"),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.string().optional(),
    level: z.enum(courseLevels),
    language: z.string().min(1, "Language is required"),
    ...priceFields,
    targetAudience: z.string().optional(),
    requirements: z.string().optional(),
    outcomes: z.string().optional(),
  })
  .refine(saleBelowPrice, saleBelowPriceError);

/** Studio > Landing page: what the catalogue card and the public course page show. */
export const courseLandingSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Keep the title under 120 characters"),
  subtitle: z.string().trim().max(160, "Keep the subtitle under 160 characters").optional(),
  description: z.string().trim().max(10_000, "Keep the description under 10,000 characters").optional(),
  categoryId: z.string().optional(),
  level: z.enum(courseLevels),
  language: z.string().trim().min(1, "Language is required").max(40),
  thumbnailUrl: z
    .string()
    .trim()
    .refine((url) => url === "" || (/^https?:\/\//i.test(url) && URL.canParse(url)), "Enter an image link starting with https://")
    .optional(),
  /** "Preview this course" on the landing page - YouTube only for now. */
  promoVideoUrl: z
    .string()
    .trim()
    .refine((url) => url === "" || parseYouTubeUrl(url) !== null, "Paste a YouTube link for the promo video")
    .optional(),
});

const listItems = (label: string) =>
  z
    .array(z.string().trim().max(200, `Keep each ${label} under 200 characters`))
    .max(20, `Add at most 20 ${label}s`)
    .transform((items) => items.filter(Boolean));

/** Studio > Intended learners. Lists arrive as repeated form fields, one per item. */
export const courseGoalsSchema = z.object({
  outcomes: listItems("learning outcome"),
  requirements: listItems("requirement"),
  targetAudience: z.string().trim().max(1000, "Keep this under 1,000 characters").optional(),
});

/** Studio > Pricing. */
export const coursePricingSchema = z.object(priceFields).refine(saleBelowPrice, saleBelowPriceError);

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
    /** The studio's length field ("12:30", or minutes). When sent it wins, and blank clears the length. */
    duration: z
      .string()
      .trim()
      .refine((text) => text === "" || parseLessonDuration(text) != null, "Enter a length like 12:30, or whole minutes")
      .optional(),
    isPreview: z.coerce.boolean().optional(),
  })
  .refine((data) => data.type !== "VIDEO" || !!data.videoUrl, {
    message: "Video URL is required for video lessons",
    path: ["videoUrl"],
  })
  .transform(({ duration, ...lesson }) =>
    duration === undefined ? lesson : { ...lesson, durationSec: parseLessonDuration(duration) ?? null }
  );

/** Moving a section or lesson one place in the curriculum. */
export const moveSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["up", "down"]),
});

export const rejectCourseSchema = z.object({
  reason: z.string().min(3, "Give a reason for the rejection"),
});

export const categorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters"),
});

export type CourseDetailsInput = z.infer<typeof courseDetailsSchema>;
export type CourseLandingInput = z.infer<typeof courseLandingSchema>;
export type CourseGoalsInput = z.infer<typeof courseGoalsSchema>;
export type CoursePricingInput = z.infer<typeof coursePricingSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
