import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

export function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

/** Categories with their published-course counts, for the public catalogue pages. */
export function listCategoriesWithCounts() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { courses: { where: { status: "PUBLISHED" } } } } },
  });
}

function revalidateCategoryPaths() {
  revalidatePath("/admin/categories");
  revalidatePath("/courses");
}

export async function createCategory(actorId: string, name: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const slug = await slugify(name, (candidate) =>
    prisma.category.findUnique({ where: { slug: candidate } })
  );
  const category = await prisma.category.create({ data: { name, slug } });
  revalidateCategoryPaths();
  return { ok: true, category } as const;
}

export async function deleteCategory(actorId: string, categoryId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.category.delete({ where: { id: categoryId } });
  revalidateCategoryPaths();
  return { ok: true } as const;
}
