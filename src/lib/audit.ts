import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function logAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
) {
  return prisma.auditLog.create({ data: { actorId, action, targetType, targetId, metadata } });
}
