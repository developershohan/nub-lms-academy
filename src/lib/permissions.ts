import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/generated/prisma/client";

export type Permission =
  | "course:create"
  | "course:update-own"
  | "course:delete-own"
  | "course:submit-review"
  | "course:approve"
  | "course:reject"
  | "course:publish"
  | "teacher:approve"
  | "teacher:reject"
  | "user:ban"
  | "user:unban"
  | "coupon:create"
  | "coupon:update"
  | "coupon:delete"
  | "order:view"
  | "order:refund"
  | "chat:moderate"
  | "certificate:generate"
  | "admin:access";

const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  STUDENT: ["course:submit-review", "certificate:generate"],
  TEACHER: ["course:create", "course:update-own", "course:delete-own", "course:submit-review"],
  ADMIN: [
    "course:approve",
    "course:reject",
    "course:publish",
    "teacher:approve",
    "teacher:reject",
    "user:ban",
    "user:unban",
    "coupon:create",
    "coupon:update",
    "coupon:delete",
    "order:view",
    "order:refund",
    "chat:moderate",
    "admin:access",
  ],
  SUPER_ADMIN: [
    "course:approve",
    "course:reject",
    "course:publish",
    "teacher:approve",
    "teacher:reject",
    "user:ban",
    "user:unban",
    "coupon:create",
    "coupon:update",
    "coupon:delete",
    "order:view",
    "order:refund",
    "chat:moderate",
    "admin:access",
  ],
};

/** Re-checks status/roles against the DB instead of trusting stale JWT claims. */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    roles: user.roles.map((r) => r.role.name),
  };
}

export function hasRole(roles: RoleName[], role: RoleName) {
  return roles.includes(role);
}

export function hasPermission(roles: RoleName[], permission: Permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

export async function canAdminAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  return hasPermission(user.roles.map((r) => r.role.name), "admin:access");
}

/**
 * Course content (details/curriculum) is edited only by its owning teacher - not admins.
 * Admin's course powers are reviewing/publishing (see canAdminAccess), never content edits.
 */
export async function canManageCourse(userId: string, courseId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") return false;
  const roles = user.roles.map((r) => r.role.name);
  if (!hasRole(roles, "TEACHER")) return false;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  return course?.teacherId === userId;
}
