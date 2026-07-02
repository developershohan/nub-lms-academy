import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageCourse, canAdminAccess } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import type { CourseDetailsInput, LessonInput } from "@/lib/validations/course";

function linesToItems(text: string | undefined) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content, index) => ({ content, sortOrder: index }));
}

/** Every page that reads course data must be listed here so mutations show up without a manual reload. */
function revalidateCoursePaths(courseId: string, slug?: string) {
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  revalidatePath("/teacher/courses");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/dashboard");
  if (slug) {
    revalidatePath(`/courses/${slug}`);
    revalidatePath("/courses");
  }
}

export function listPublishedCourses({ q, categorySlug }: { q?: string; categorySlug?: string } = {}) {
  return prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      title: q ? { contains: q, mode: "insensitive" } : undefined,
      category: categorySlug ? { slug: categorySlug } : undefined,
    },
    include: { category: true, teacher: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
  });
}

const PUBLIC_COURSE_DETAIL_INCLUDE = {
  category: true,
  teacher: { select: { name: true } },
  requirements: { orderBy: { sortOrder: "asc" as const } },
  outcomes: { orderBy: { sortOrder: "asc" as const } },
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      lessons: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          id: true,
          title: true,
          type: true,
          durationSec: true,
          isPreview: true,
          // Full content/video URL is only safe to expose for free-preview lessons;
          // real access control for paid lessons lands with enrollment in Phase 3.
          content: false,
          videoAsset: false,
        },
      },
    },
  },
};

export function getPublishedCourseBySlug(slug: string) {
  return prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: PUBLIC_COURSE_DETAIL_INCLUDE,
  });
}

/** Full editable detail for the owning teacher, or the public-safe shape if the course is published. */
export async function getCourseDetailForViewer(courseId: string, viewerId?: string) {
  if (viewerId && (await canManageCourse(viewerId, courseId))) {
    return getCourseForEdit(courseId, viewerId);
  }
  return prisma.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    include: PUBLIC_COURSE_DETAIL_INCLUDE,
  });
}

export function listTeacherCourses(teacherId: string) {
  return prisma.course.findMany({
    where: { teacherId },
    include: { category: true },
    orderBy: { updatedAt: "desc" },
  });
}

export function listCoursesForAdmin() {
  return prisma.course.findMany({
    include: { category: true, teacher: { select: { name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

/** Only the owning teacher can manage a course - admins review/approve/publish but don't edit content. */
export async function getCourseForEdit(courseId: string, userId: string) {
  if (!(await canManageCourse(userId, courseId))) return null;

  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      category: true,
      requirements: { orderBy: { sortOrder: "asc" } },
      outcomes: { orderBy: { sortOrder: "asc" } },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { lessons: { orderBy: { sortOrder: "asc" }, include: { videoAsset: true } } },
      },
    },
  });
}

export async function createCourse(teacherId: string, title: string) {
  const slug = await slugify(title, (candidate) => prisma.course.findUnique({ where: { slug: candidate } }));
  const course = await prisma.course.create({ data: { title, slug, teacherId } });
  revalidatePath("/teacher/courses");
  return course;
}

export async function updateCourseDetails(courseId: string, userId: string, data: CourseDetailsInput) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const course = await prisma.$transaction(async (tx) => {
    const updated = await tx.course.update({
      where: { id: courseId },
      data: {
        title: data.title,
        subtitle: data.subtitle || null,
        description: data.description || null,
        categoryId: data.categoryId || null,
        level: data.level,
        language: data.language,
        price: data.price,
        salePrice: data.salePrice ?? null,
        targetAudience: data.targetAudience || null,
      },
    });
    await tx.courseRequirement.deleteMany({ where: { courseId } });
    await tx.courseOutcome.deleteMany({ where: { courseId } });
    const requirements = linesToItems(data.requirements);
    const outcomes = linesToItems(data.outcomes);
    if (requirements.length) {
      await tx.courseRequirement.createMany({ data: requirements.map((r) => ({ ...r, courseId })) });
    }
    if (outcomes.length) {
      await tx.courseOutcome.createMany({ data: outcomes.map((o) => ({ ...o, courseId })) });
    }
    return updated;
  });

  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function submitCourseForReview(courseId: string, userId: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { sections: { include: { lessons: true } } },
  });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "DRAFT" && course.status !== "REJECTED") {
    return { error: "Only draft or rejected courses can be submitted for review" } as const;
  }
  const lessonCount = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
  if (lessonCount === 0) {
    return { error: "Add at least one lesson before submitting for review" } as const;
  }

  await prisma.course.update({
    where: { id: courseId },
    data: { status: "IN_REVIEW", rejectionReason: null },
  });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function approveCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "IN_REVIEW") return { error: "Course is not awaiting review" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "APPROVED" } });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function rejectCourse(actorId: string, courseId: string, reason: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "IN_REVIEW") return { error: "Course is not awaiting review" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "REJECTED", rejectionReason: reason } });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function publishCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "APPROVED") return { error: "Only approved courses can be published" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function unpublishCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "PUBLISHED") return { error: "Course is not published" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "APPROVED" } });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function createSection(courseId: string, userId: string, title: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const last = await prisma.courseSection.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" } });
  const section = await prisma.courseSection.create({
    data: { courseId, title, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true, section } as const;
}

async function getCourseIdForSection(sectionId: string) {
  const section = await prisma.courseSection.findUnique({ where: { id: sectionId }, select: { courseId: true } });
  return section?.courseId;
}

export async function updateSection(sectionId: string, userId: string, title: string) {
  const courseId = await getCourseIdForSection(sectionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.courseSection.update({ where: { id: sectionId }, data: { title } });
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true } as const;
}

export async function deleteSection(sectionId: string, userId: string) {
  const courseId = await getCourseIdForSection(sectionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.courseSection.delete({ where: { id: sectionId } });
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true } as const;
}

async function getCourseIdForLesson(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { section: { select: { courseId: true } } },
  });
  return lesson?.section.courseId;
}

export async function createLesson(sectionId: string, userId: string, data: LessonInput) {
  const courseId = await getCourseIdForSection(sectionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const last = await prisma.lesson.findFirst({ where: { sectionId }, orderBy: { sortOrder: "desc" } });
  const lesson = await prisma.lesson.create({
    data: {
      sectionId,
      title: data.title,
      type: data.type,
      content: data.type === "TEXT" ? data.content || null : null,
      durationSec: data.durationSec,
      isPreview: !!data.isPreview,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      videoAsset:
        data.type === "VIDEO" && data.videoUrl
          ? { create: { playbackUrl: data.videoUrl, uploadedById: userId } }
          : undefined,
    },
  });
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true, lesson } as const;
}

export async function updateLesson(lessonId: string, userId: string, data: LessonInput) {
  const courseId = await getCourseIdForLesson(lessonId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.$transaction(async (tx) => {
    await tx.lesson.update({
      where: { id: lessonId },
      data: {
        title: data.title,
        type: data.type,
        content: data.type === "TEXT" ? data.content || null : null,
        durationSec: data.durationSec,
        isPreview: !!data.isPreview,
      },
    });

    if (data.type === "VIDEO" && data.videoUrl) {
      await tx.videoAsset.upsert({
        where: { lessonId },
        create: { lessonId, playbackUrl: data.videoUrl, uploadedById: userId },
        update: { playbackUrl: data.videoUrl },
      });
    } else {
      await tx.videoAsset.deleteMany({ where: { lessonId } });
    }
  });

  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true } as const;
}

export async function deleteLesson(lessonId: string, userId: string) {
  const courseId = await getCourseIdForLesson(lessonId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.lesson.delete({ where: { id: lessonId } });
  revalidatePath(`/teacher/courses/${courseId}/edit`);
  return { ok: true } as const;
}
