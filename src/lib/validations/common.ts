import { z } from "zod";

/** Shared by every "assign an existing account by email" form (manual enrollment, sub-instructor
 * assignment) - all of them take exactly one field and apply the same validation. */
export const assignByEmailSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export type AssignByEmailInput = z.infer<typeof assignByEmailSchema>;

/**
 * An optional numeric form field where a blank input (or a JSON null) means "not set". Plain
 * `z.coerce.number()` turns "" and null into 0 before any `.or(z.literal(""))` fallback runs, which
 * silently saved every blank sale price as $0 - i.e. made paid courses free.
 */
export function optionalNumber<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
    schema.optional()
  );
}
