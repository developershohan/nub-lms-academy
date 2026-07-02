import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { CouponInput } from "@/lib/validations/coupon";

export async function validateCoupon(code: string, userId: string, courseId: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
  if (!coupon || !coupon.active) return { error: "Coupon not found" } as const;

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { error: "This coupon isn't active yet" } as const;
  if (coupon.expiresAt && coupon.expiresAt < now) return { error: "This coupon has expired" } as const;

  if (coupon.appliesTo === "SPECIFIC_COURSE" && coupon.courseId !== courseId) {
    return { error: "This coupon doesn't apply to this course" } as const;
  }
  if (coupon.appliesTo === "SUBSCRIPTION") {
    return { error: "This coupon only applies to subscriptions" } as const;
  }

  if (coupon.maxRedemptions != null) {
    const totalRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    if (totalRedemptions >= coupon.maxRedemptions) return { error: "This coupon has been fully redeemed" } as const;
  }
  if (coupon.perUserLimit != null) {
    const userRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (userRedemptions >= coupon.perUserLimit) return { error: "You've already used this coupon" } as const;
  }

  return { ok: true, coupon } as const;
}

export function calculateDiscount(coupon: { discountType: string; discountValue: unknown }, subtotal: number) {
  const value = Number(coupon.discountValue);
  const discount = coupon.discountType === "PERCENTAGE" ? (subtotal * value) / 100 : value;
  return Math.min(discount, subtotal);
}

export function listCouponsForAdmin() {
  return prisma.coupon.findMany({
    include: { course: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCoupon(actorId: string, data: CouponInput) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (existing) return { error: "A coupon with this code already exists" } as const;

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code,
      discountType: data.discountType,
      discountValue: data.discountValue,
      appliesTo: data.courseId ? "SPECIFIC_COURSE" : "ALL_COURSES",
      courseId: data.courseId || null,
      maxRedemptions: data.maxRedemptions ?? null,
      perUserLimit: data.perUserLimit ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });
  await logAudit(actorId, "coupon:create", "Coupon", coupon.id, { code: coupon.code });
  revalidatePath("/admin/coupons");
  return { ok: true, coupon } as const;
}

export async function setCouponActive(actorId: string, couponId: string, active: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.coupon.update({ where: { id: couponId }, data: { active } });
  await logAudit(actorId, active ? "coupon:activate" : "coupon:deactivate", "Coupon", couponId);
  revalidatePath("/admin/coupons");
  return { ok: true } as const;
}
