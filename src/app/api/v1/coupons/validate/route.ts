import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCoupon, calculateDiscount } from "@/server/services/coupon-service";
import { prisma } from "@/lib/prisma";

const schema = z.object({ code: z.string().min(1), courseId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const result = await validateCoupon(parsed.data.code, session.user.id, parsed.data.courseId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
  const subtotal = Number(course?.salePrice ?? course?.price ?? 0);
  const discountAmount = calculateDiscount(result.coupon, subtotal);

  return NextResponse.json({ valid: true, discountAmount, total: Math.max(0, subtotal - discountAmount) });
}
