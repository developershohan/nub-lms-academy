import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { couponSchema } from "@/lib/validations/coupon";
import { listCouponsForAdmin, createCoupon } from "@/server/services/coupon-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const coupons = await listCouponsForAdmin();
  return NextResponse.json({ coupons });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = couponSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const result = await createCoupon(session.user.id, parsed.data);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ coupon: result.coupon }, { status: 201 });
}
