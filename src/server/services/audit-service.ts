import "server-only";
import { prisma } from "@/lib/prisma";

/** AuditLog.actorId is a plain string, not a relation (an actor's account may later be deleted
 * while the log entry must still exist) - so the actor is resolved with a second lookup instead
 * of a Prisma `include`. */
export async function listAuditLogsForAdmin(limit = 100) {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });

  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  return logs.map((log) => ({ ...log, actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null }));
}
