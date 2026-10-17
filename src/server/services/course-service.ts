import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageCourse, canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { recomputeCourseCompletion } from "@/server/services/progress-service";
import { notify, notifyAdmins } from "@/server/services/notification-service";
import { refreshCourseStats } from "@/server/services/course-stats-service";
import { getCourseChecklist, moveInList, studioHref } from "@/lib/studio";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CourseDetailsInput,
  CourseGoalsInput,
  CourseLandingInput,
  CoursePricingInput,
  LessonInput,
} from "@/lib/validations/course";

function linesToItems(text: string | undefined) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content, index) => ({ content, sortOrder: index }));
}

/** The studio layout shows the publish checklist, so every studio page refreshes after any edit. */
function revalidateStudio(courseId: string) {
  revalidatePath(studioHref(courseId), "layout");
}

/** Every page that reads course data must be listed here so mutations show up without a manual reload. */
function revalidateCoursePaths(courseId: string, slug?: string) {
  revalidateStudio(courseId);
  revalidatePath("/teacher/courses");
  revalidatePath("/teacher/dashboard");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/dashboard");
  if (slug) {
    revalidatePath(`/courses/${slug}`);
    revalidatePath("/courses");
    revalidatePath("/");
    revalidatePath("/categories");
    // The home page's shared lists (featured, trending, stats) - see home-cache.ts.
    revalidateTag("home", "max");
  }
}

/**
 * Once an admin has reviewed a course (APPROVED or PUBLISHED), a teacher edit to its details,
 * price or lessons flags it for re-review instead of slipping through unseen - previously a course
 * could be approved and then have its price, videos or lessons swapped. The course stays live (no
 * downtime for enrolled students); every change is audit-logged, and admins are notified on the
 * first change since the last review. Draft revisions of a live course are a later studio feature.
 */
async function flagChangedSinceReview(
  courseId: string,
  actorId: string,
  change: string,
  details: Record<string, string | number | null> = {}
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, title: true, changedSinceReviewAt: true },
  });
  if (!course || (course.status !== "APPROVED" && course.status !== "PUBLISHED")) return;

  await prisma.course.update({ where: { id: courseId }, data: { changedSinceReviewAt: new Date() } });
  await logAudit(actorId, "course:changed-after-review", "Course", courseId, { change, ...details });
  if (course.changedSinceReviewAt) return; // admins were already told about this round of changes

  await notifyAdmins({
    type: "course-review",
    title: `"${course.title}" changed after review`,
    body: `The teacher changed: ${change}`,
    link: "/admin/courses",
    actorId,
    entity: { type: "Course", id: courseId },
  });
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

/**
 * Admin-curated home page rail. Falls back to the newest published courses when
 * fewer than `minimum` are explicitly featured, so the home page never renders empty.
 */
export async function listFeaturedCourses(limit = 6, minimum = 3) {
  const include = { category: true, teacher: { select: { name: true } } };
  const featured = await prisma.course.findMany({
    where: { status: "PUBLISHED", isFeatured: true },
    include,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  if (featured.length >= minimum) return featured;

  const fill = await prisma.course.findMany({
    where: { status: "PUBLISHED", id: { notIn: featured.map((c) => c.id) } },
    include,
    orderBy: { publishedAt: "desc" },
    take: limit - featured.length,
  });
  return [...featured, ...fill];
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

/** Full lesson content for the learning player - caller must check canAccessCourse first.
 * createdAt breaks sortOrder ties, so the lesson order (and with it previous/next) is the same on every request. */
export function getCourseForLearning(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teacher: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      sections: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          lessons: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { videoAsset: true } },
        },
      },
    },
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
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          lessons: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { videoAsset: true } },
        },
      },
    },
  });
}

/** Just what the publish checklist reads - cheap enough to load for every course on a teacher's list. */
export const CHECKLIST_SELECT = {
  subtitle: true,
  description: true,
  categoryId: true,
  thumbnailUrl: true,
  targetAudience: true,
  _count: { select: { outcomes: true, requirements: true } },
  sections: { select: { lessons: { select: { type: true, durationSec: true, isPreview: true } } } },
} satisfies Prisma.CourseSelect;

export function checklistFor(course: Prisma.CourseGetPayload<{ select: typeof CHECKLIST_SELECT }>) {
  return getCourseChecklist({
    ...course,
    outcomeCount: course._count.outcomes,
    requirementCount: course._count.requirements,
  });
}

export async function createCourse(teacherId: string, title: string) {
  const slug = await slugify(title, (candidate) => prisma.course.findUnique({ where: { slug: candidate } }));
  const course = await prisma.course.create({ data: { title, slug, teacherId } });
  revalidatePath("/teacher/courses");
  return course;
}

/** Replaces the "What you'll learn" and requirements lists, keeping the order they were given in. */
async function replaceCourseLists(
  tx: Prisma.TransactionClient,
  courseId: string,
  lists: { requirements: string[]; outcomes: string[] }
) {
  const items = (texts: string[]) => texts.map((content, sortOrder) => ({ content, sortOrder, courseId }));
  await tx.courseRequirement.deleteMany({ where: { courseId } });
  await tx.courseOutcome.deleteMany({ where: { courseId } });
  if (lists.requirements.length) await tx.courseRequirement.createMany({ data: items(lists.requirements) });
  if (lists.outcomes.length) await tx.courseOutcome.createMany({ data: items(lists.outcomes) });
}

async function getPriceBefore(courseId: string) {
  const before = await prisma.course.findUnique({ where: { id: courseId }, select: { price: true, salePrice: true } });
  return {
    previousPrice: before ? Number(before.price) : null,
    previousSalePrice: before?.salePrice != null ? Number(before.salePrice) : null,
  };
}

export async function updateCourseDetails(courseId: string, userId: string, data: CourseDetailsInput) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const priceBefore = await getPriceBefore(courseId);
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
    await replaceCourseLists(tx, courseId, {
      requirements: linesToItems(data.requirements).map((i) => i.content),
      outcomes: linesToItems(data.outcomes).map((i) => i.content),
    });
    return updated;
  });

  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "course details", {
    ...priceBefore,
    price: data.price,
    salePrice: data.salePrice ?? null,
  });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

/** Studio > Landing page. */
export async function updateCourseLanding(courseId: string, userId: string, data: CourseLandingInput) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      title: data.title,
      subtitle: data.subtitle || null,
      description: data.description || null,
      categoryId: data.categoryId || null,
      level: data.level,
      language: data.language,
      thumbnailUrl: data.thumbnailUrl || null,
    },
  });
  await flagChangedSinceReview(courseId, userId, "landing page", { title: data.title });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

/** Studio > Intended learners. */
export async function updateCourseGoals(courseId: string, userId: string, data: CourseGoalsInput) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const course = await prisma.$transaction(async (tx) => {
    await replaceCourseLists(tx, courseId, data);
    return tx.course.update({ where: { id: courseId }, data: { targetAudience: data.targetAudience || null } });
  });
  await flagChangedSinceReview(courseId, userId, "intended learners");
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

/** Studio > Pricing. Price changes on a reviewed course are logged with the old and new amounts. */
export async function updateCoursePricing(courseId: string, userId: string, data: CoursePricingInput) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const priceBefore = await getPriceBefore(courseId);
  const course = await prisma.course.update({
    where: { id: courseId },
    data: { price: data.price, salePrice: data.salePrice ?? null },
  });
  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "pricing", {
    ...priceBefore,
    price: data.price,
    salePrice: data.salePrice ?? null,
  });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function submitCourseForReview(courseId: string, userId: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true, ...CHECKLIST_SELECT },
  });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "DRAFT" && course.status !== "REJECTED") {
    return { error: "Only draft or rejected courses can be submitted for review" } as const;
  }
  // Same checklist the studio shows, so the button and the server never disagree.
  const missing = checklistFor(course).items.find((item) => item.required && !item.done);
  if (missing) {
    return { error: `Finish the checklist before submitting: ${missing.label.toLowerCase()}` } as const;
  }

  await prisma.course.update({
    where: { id: courseId },
    data: { status: "IN_REVIEW", rejectionReason: null },
  });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

/** Tells the owning teacher what an admin decided about their course. */
function notifyTeacherOfDecision(
  course: { id: string; teacherId: string },
  actorId: string,
  message: { title: string; body: string }
) {
  return notify([course.teacherId], {
    type: "course_decision",
    ...message,
    link: studioHref(course.id),
    actorId,
    entity: { type: "Course", id: course.id },
    refreshPage: true,
  });
}

export async function approveCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "IN_REVIEW") return { error: "Course is not awaiting review" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "APPROVED", changedSinceReviewAt: null } });
  await logAudit(actorId, "course:approve", "Course", courseId);
  await notifyTeacherOfDecision(course, actorId, {
    title: `"${course.title}" was approved`,
    body: "It will be published to the catalogue shortly.",
  });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function rejectCourse(actorId: string, courseId: string, reason: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "IN_REVIEW") return { error: "Course is not awaiting review" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "REJECTED", rejectionReason: reason } });
  await logAudit(actorId, "course:reject", "Course", courseId, { reason });
  await notifyTeacherOfDecision(course, actorId, { title: `Changes requested on "${course.title}"`, body: reason });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function publishCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "APPROVED") return { error: "Only approved courses can be published" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await logAudit(actorId, "course:publish", "Course", courseId);
  await notifyTeacherOfDecision(course, actorId, {
    title: `"${course.title}" is live`,
    body: "Students can now find and enroll in it.",
  });
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function unpublishCourse(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (course.status !== "PUBLISHED") return { error: "Course is not published" } as const;

  // Unpublished courses must never surface on the home page rail.
  await prisma.course.update({ where: { id: courseId }, data: { status: "APPROVED", isFeatured: false } });
  await logAudit(actorId, "course:unpublish", "Course", courseId);
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

/** Admin sign-off on the changes a teacher made after review (see flagChangedSinceReview). */
export async function markCourseReviewed(actorId: string, courseId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  if (!course) return { error: "Not found" } as const;

  await prisma.course.update({ where: { id: courseId }, data: { changedSinceReviewAt: null } });
  await logAudit(actorId, "course:changes-reviewed", "Course", courseId);
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function setCourseFeatured(actorId: string, courseId: string, featured: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Not found" } as const;
  if (featured && course.status !== "PUBLISHED") {
    return { error: "Only published courses can be featured" } as const;
  }

  await prisma.course.update({ where: { id: courseId }, data: { isFeatured: featured } });
  await logAudit(actorId, featured ? "course:feature" : "course:unfeature", "Course", courseId);
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function setCourseSubscriptionIncluded(actorId: string, courseId: string, included: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const course = await prisma.course.update({
    where: { id: courseId },
    data: { isSubscriptionIncluded: included },
  });
  await logAudit(actorId, included ? "course:include-in-subscription" : "course:exclude-from-subscription", "Course", courseId);
  revalidateCoursePaths(courseId, course.slug);
  return { ok: true } as const;
}

export async function createSection(courseId: string, userId: string, title: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const last = await prisma.courseSection.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" } });
  const section = await prisma.courseSection.create({
    data: { courseId, title, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidateStudio(courseId);
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
  revalidateStudio(courseId);
  return { ok: true } as const;
}

/** Swaps a section with its neighbour, renumbering the whole course so sortOrder ties can't linger. */
export async function moveSection(sectionId: string, userId: string, direction: "up" | "down") {
  const courseId = await getCourseIdForSection(sectionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const sections = await prisma.courseSection.findMany({
    where: { courseId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const order = moveInList(sections.map((s) => s.id), sectionId, direction);
  if (!order) return { ok: true } as const; // already first or last

  await prisma.$transaction(async (tx) => {
    for (const [sortOrder, id] of order.entries()) {
      await tx.courseSection.update({ where: { id }, data: { sortOrder } });
    }
  });
  await flagChangedSinceReview(courseId, userId, "curriculum reordered", { sectionId });
  revalidateStudio(courseId);
  return { ok: true } as const;
}

export async function deleteSection(sectionId: string, userId: string) {
  const courseId = await getCourseIdForSection(sectionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.courseSection.delete({ where: { id: sectionId } });
  // Its lessons went with it, which may leave some students with every remaining lesson done.
  await recomputeCourseCompletion(courseId);
  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "section removed", { sectionId });
  revalidateStudio(courseId);
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
  await recomputeCourseCompletion(courseId);
  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "lesson added", { lessonId: lesson.id, title: data.title });
  revalidateStudio(courseId);
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

  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "lesson edited", {
    lessonId,
    title: data.title,
    videoUrl: data.type === "VIDEO" ? data.videoUrl || null : null,
  });
  revalidateStudio(courseId);
  return { ok: true } as const;
}

/** Moves a lesson one place within its section, renumbering the section's lessons. */
export async function moveLesson(lessonId: string, userId: string, direction: "up" | "down") {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { sectionId: true, section: { select: { courseId: true } } },
  });
  const courseId = lesson?.section.courseId;
  if (!lesson || !courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const lessons = await prisma.lesson.findMany({
    where: { sectionId: lesson.sectionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const order = moveInList(lessons.map((l) => l.id), lessonId, direction);
  if (!order) return { ok: true } as const;

  await prisma.$transaction(async (tx) => {
    for (const [sortOrder, id] of order.entries()) {
      await tx.lesson.update({ where: { id }, data: { sortOrder } });
    }
  });
  await flagChangedSinceReview(courseId, userId, "curriculum reordered", { lessonId });
  revalidateStudio(courseId);
  return { ok: true } as const;
}

export async function deleteLesson(lessonId: string, userId: string) {
  const courseId = await getCourseIdForLesson(lessonId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.lesson.delete({ where: { id: lessonId } });
  await recomputeCourseCompletion(courseId);
  await refreshCourseStats(courseId);
  await flagChangedSinceReview(courseId, userId, "lesson removed", { lessonId });
  revalidateStudio(courseId);
  return { ok: true } as const;
}
