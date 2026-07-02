"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCourse } from "@/server/services/course-service";

export type CreateCourseState = { error?: string };

const titleSchema = z.object({ title: z.string().min(3, "Title must be at least 3 characters") });

export async function createCourseAction(
  _prevState: CreateCourseState,
  formData: FormData
): Promise<CreateCourseState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const parsed = titleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const course = await createCourse(session.user.id, parsed.data.title);
  redirect(`/teacher/courses/${course.id}/edit`);
}
