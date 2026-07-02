import { z } from "zod";

export const subscriptionIntervals = ["MONTH", "YEAR"] as const;

export const subscriptionPlanSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  interval: z.enum(subscriptionIntervals),
  price: z.coerce.number().positive(),
});

export type SubscriptionPlanInput = z.infer<typeof subscriptionPlanSchema>;
