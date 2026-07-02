import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function toggleWishlist(userId: string, courseId: string, slug: string) {
  const existing = await prisma.wishlist.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) {
    await prisma.wishlist.delete({ where: { id: existing.id } });
  } else {
    await prisma.wishlist.create({ data: { userId, courseId } });
  }
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/student/wishlist");
  return { ok: true, wishlisted: !existing } as const;
}

export function listWishlist(userId: string) {
  return prisma.wishlist.findMany({
    where: { userId },
    include: { course: { include: { category: true, teacher: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export function isWishlisted(userId: string, courseId: string) {
  return prisma.wishlist
    .findUnique({ where: { userId_courseId: { userId, courseId } } })
    .then((row) => !!row);
}
