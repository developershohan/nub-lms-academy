import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAdminAccess } from "@/lib/permissions";
import { couponSchema } from "@/lib/validations/coupon";
import { parseJsonBody } from "@/lib/http/json";
import { listCouponsForAdmin, createCoupon } from "@/server/services/coupon-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await canAdminAccess(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const coupons = await listCouponsForAdmin();
  return NextResponse.json({ coupons });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, couponSchema);
  if ("response" in parsed) return parsed.response;

  const result = await createCoupon(session.user.id, parsed.data);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ coupon: result.coupon }, { status: 201 });
}
