import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const SETTINGS_ID = "singleton";

export function getPlatformSettings() {
  return prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

export async function setAutoApprovePayments(actorId: string, autoApprovePayments: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, autoApprovePayments },
    update: { autoApprovePayments },
  });

  await logAudit(actorId, "settings:auto-approve-payments", "PlatformSetting", SETTINGS_ID);
  revalidatePath("/admin/orders");
  return { ok: true } as const;
}
