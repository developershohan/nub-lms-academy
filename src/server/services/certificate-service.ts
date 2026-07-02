import "server-only";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canGenerateCertificate, canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

function generateCertificateNumber() {
  return `NUB-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/** Idempotent: an existing, non-revoked certificate is returned as-is rather than duplicated. */
export async function generateCertificate(userId: string, courseId: string) {
  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing && !existing.revoked) return { ok: true, certificate: existing } as const;

  if (!(await canGenerateCertificate(userId, courseId))) {
    return { error: "You haven't met the requirements for a certificate yet" } as const;
  }

  const [user, course, enrollment] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { teacher: true } }),
    prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId, courseId } } }),
  ]);

  const data = {
    certificateNumber: generateCertificateNumber(),
    studentName: user.name ?? user.email,
    courseTitle: course.title,
    teacherName: course.teacher.name ?? "Instructor",
    completedAt: enrollment.completedAt!,
    issuedAt: new Date(),
    revoked: false,
    revokedAt: null,
  };

  const certificate = existing
    ? await prisma.certificate.update({ where: { id: existing.id }, data })
    : await prisma.certificate.create({ data: { ...data, userId, courseId } });

  revalidatePath("/student/certificates");
  revalidatePath("/admin/certificates");
  return { ok: true, certificate } as const;
}

export function listCertificatesForStudent(userId: string) {
  return prisma.certificate.findMany({
    where: { userId, revoked: false },
    orderBy: { issuedAt: "desc" },
  });
}

/** Completed courses that don't have a certificate yet and are actually eligible (lessons + quizzes). */
export async function listCertificateEligibleCourses(userId: string) {
  const completedEnrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE", completedAt: { not: null } },
    include: { course: { select: { id: true, title: true } } },
  });

  const eligible = [];
  for (const enrollment of completedEnrollments) {
    const hasCertificate = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId: enrollment.courseId } },
    });
    if (hasCertificate && !hasCertificate.revoked) continue;
    if (await canGenerateCertificate(userId, enrollment.courseId)) eligible.push(enrollment.course);
  }
  return eligible;
}

export async function getCertificateForStudent(userId: string, certificateId: string) {
  const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!certificate || certificate.userId !== userId) return null;
  return certificate;
}

export function getCertificateByNumber(certificateNumber: string) {
  return prisma.certificate.findUnique({ where: { certificateNumber } });
}

export function listCertificatesForAdmin() {
  return prisma.certificate.findMany({
    include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
    orderBy: { issuedAt: "desc" },
  });
}

export async function revokeCertificate(actorId: string, certificateId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.certificate.update({
    where: { id: certificateId },
    data: { revoked: true, revokedAt: new Date() },
  });
  await logAudit(actorId, "certificate:revoke", "Certificate", certificateId);
  revalidatePath("/admin/certificates");
  revalidatePath("/student/certificates");
  return { ok: true } as const;
}
