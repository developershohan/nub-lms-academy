import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

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
