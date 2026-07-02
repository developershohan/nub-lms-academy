import { z } from "zod";

export const discountTypes = ["PERCENTAGE", "FIXED_AMOUNT"] as const;

export const couponSchema = z.object({
  code: z
    .string()
    .min(3, "Code must be at least 3 characters")
    .transform((v) => v.toUpperCase().trim()),
  discountType: z.enum(discountTypes),
  discountValue: z.coerce.number().positive(),
  courseId: z.string().optional(),
  maxRedemptions: z.coerce.number().int().min(1).optional().or(z.literal("").transform(() => undefined)),
  perUserLimit: z.coerce.number().int().min(1).optional().or(z.literal("").transform(() => undefined)),
  expiresAt: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export type CouponInput = z.infer<typeof couponSchema>;
