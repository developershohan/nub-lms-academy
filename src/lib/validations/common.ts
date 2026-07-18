import { z } from "zod";

/** Shared by every "assign an existing account by email" form (manual enrollment, sub-instructor
 * assignment) - all of them take exactly one field and apply the same validation. */
export const assignByEmailSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export type AssignByEmailInput = z.infer<typeof assignByEmailSchema>;
