"use server";

import { auth } from "@/lib/auth";
import { categorySchema } from "@/lib/validations/course";
import { createCategory, deleteCategory } from "@/server/services/category-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createCategoryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createCategory(userId, parsed.data.name);
  return "error" in result ? { error: result.error } : {};
}

export async function deleteCategoryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const categoryId = formData.get("categoryId") as string;
  const result = await deleteCategory(userId, categoryId);
  return "error" in result ? { error: result.error } : {};
}
