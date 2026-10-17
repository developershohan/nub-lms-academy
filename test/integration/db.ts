import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CourseStatus, RoleName } from "@/generated/prisma/client";

/** Empties every table (keeping the migration history) so each test starts from nothing. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

export function createUser(roles: RoleName[] = ["STUDENT"]) {
  return prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      name: "Test User",
      emailVerified: new Date(),
      roles: { create: roles.map((name) => ({ role: { connectOrCreate: { where: { name }, create: { name } } } })) },
    },
  });
}

export function createCourse(
  teacherId: string,
  {
    price = 49.99,
    status = "PUBLISHED",
    lessons = 2,
    isSubscriptionIncluded = false,
  }: { price?: number; status?: CourseStatus; lessons?: number; isSubscriptionIncluded?: boolean } = {}
) {
  return prisma.course.create({
    data: {
      title: "Web Basics",
      slug: `web-basics-${randomUUID()}`,
      teacherId,
      price,
      status,
      isSubscriptionIncluded,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      sections: {
        create: [
          {
            title: "Getting started",
            lessons: {
              create: Array.from({ length: lessons }, (_, i) => ({
                title: `Lesson ${i + 1}`,
                type: "TEXT" as const,
                content: "Lesson text",
                sortOrder: i,
              })),
            },
          },
        ],
      },
    },
    include: { sections: { include: { lessons: true } } },
  });
}
