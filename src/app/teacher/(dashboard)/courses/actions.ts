"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, hasRole } from "@/lib/permissions";
import { createCourse } from "@/server/services/course-service";

export type CreateCourseState = { error?: string };

const titleSchema = z.object({ title: z.string().min(3, "Title must be at least 3 characters") });

export async function createCourseAction(
  _prevState: CreateCourseState,
  formData: FormData
): Promise<CreateCourseState> {
  // Server Actions are reachable independent of page/layout rendering, so the TEACHER role must
  // be re-verified here rather than trusted from the dashboard the form happens to render on.
  const user = await getCurrentUser();
  if (!user || !hasRole(user.roles, "TEACHER")) return { error: "Forbidden" };

  const parsed = titleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const course = await createCourse(user.id, parsed.data.title);
  redirect(`/teacher/courses/${course.id}/edit`);
}
