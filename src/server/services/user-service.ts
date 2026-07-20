import "server-only";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { sendEmailVerification } from "@/server/services/auth-service";
import type { UpdateProfileInput } from "@/lib/validations/profile";

export function listUsersForAdmin(q?: string) {
  return prisma.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    include: {
      roles: { include: { role: true } },
      bans: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

function revalidateUserPaths() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit-logs");
}

/** Admins/super-admins can't be banned through this action - prevents an admin from locking out
 * a peer (or themselves) by mistake; role changes/removal are a separate, more deliberate action. */
export async function banUser(actorId: string, userId: string, reason: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;
  if (actorId === userId) return { error: "You cannot ban yourself" } as const;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!target) return { error: "User not found" } as const;
  const targetRoles = target.roles.map((r) => r.role.name);
  if (targetRoles.includes("ADMIN") || targetRoles.includes("SUPER_ADMIN")) {
    return { error: "Admins cannot be banned here" } as const;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "BANNED" } }),
    prisma.userBan.create({ data: { userId, bannedById: actorId, reason } }),
  ]);
  await logAudit(actorId, "user:ban", "User", userId, { reason });
  revalidateUserPaths();
  return { ok: true } as const;
}

export async function unbanUser(actorId: string, userId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  await logAudit(actorId, "user:unban", "User", userId);
  revalidateUserPaths();
  return { ok: true } as const;
}

const ASSIGNABLE_ROLES = ["STUDENT", "TEACHER", "SUPPORT"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * Admin-created accounts, not self-registration - sets the initial password directly rather than
 * an invite email (see docs - manual account creation was scoped to not require wiring up an
 * invite flow). Whether the email is pre-verified is the admin's explicit choice
 * (autoVerify) rather than an implicit default - skip it to vouch for the address directly, or
 * leave it off to make the new account go through the normal verification-email flow itself.
 *
 * Deliberately cannot create ADMIN/SUPER_ADMIN through this quick form - granting admin rights
 * stays a separate, more deliberate action, same reasoning as banUser refusing to act on admins.
 */
export async function createUserByAdmin(
  actorId: string,
  data: { name: string; email: string; password: string; role: AssignableRole; autoVerify: boolean }
) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;
  if (!ASSIGNABLE_ROLES.includes(data.role)) return { error: "Invalid role" } as const;

  const email = data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists" } as const;

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: data.name, email, passwordHash, emailVerified: data.autoVerify ? new Date() : null },
    });
    const role = await tx.role.upsert({
      where: { name: data.role },
      create: { name: data.role },
      update: {},
    });
    await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    return created;
  });

  await logAudit(actorId, "user:create", "User", user.id, { role: data.role, autoVerify: data.autoVerify });
  if (!data.autoVerify) await sendEmailVerification(email);
  revalidateUserPaths();
  return { ok: true, userId: user.id } as const;
}

export function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      phone: true,
      address: true,
      image: true,
      // Whether a password exists at all - OAuth-only accounts have none, and the profile page
      // uses this to hide the email/password change forms rather than show a broken flow that
      // can never succeed (there's no password to confirm against).
      passwordHash: true,
    },
  });
}

function revalidateProfilePaths() {
  revalidatePath("/profile");
}

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone || null, address: data.address || null },
  });
  revalidateProfilePaths();
  return { ok: true } as const;
}

/** Credential accounts only (OAuth-only users have no passwordHash to confirm against - the
 * profile page doesn't render this form for them). Changing email resets verification and
 * re-sends it - an unverified new address must be proven again, exactly like at registration. */
export async function changeEmail(userId: string, newEmail: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) return { error: "This account has no password set" } as const;

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" } as const;

  if (newEmail === user.email) return { error: "That's already your email" } as const;

  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) return { error: "That email is already in use" } as const;

  await prisma.user.update({ where: { id: userId }, data: { email: newEmail, emailVerified: null } });
  await sendEmailVerification(newEmail);
  revalidateProfilePaths();
  return { ok: true } as const;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) return { error: "This account has no password set" } as const;

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" } as const;

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  revalidateProfilePaths();
  return { ok: true } as const;
}
