import { listCouponsForAdmin } from "@/server/services/coupon-service";
import { listCoursesForAdmin } from "@/server/services/course-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCouponForm, CouponStatusToggle } from "@/components/admin/coupon-manager";

export default async function AdminCouponsPage() {
  const [coupons, courses] = await Promise.all([listCouponsForAdmin(), listCoursesForAdmin()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Coupons</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create coupon</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCouponForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {coupons.map((coupon) => (
          <Card key={coupon.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{coupon.code}</CardTitle>
              <Badge variant={coupon.active ? "secondary" : "outline"}>
                {coupon.active ? "Active" : "Inactive"}
              </Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>
                  {coupon.discountType === "PERCENTAGE"
                    ? `${Number(coupon.discountValue)}% off`
                    : `$${Number(coupon.discountValue).toFixed(2)} off`}
                  {coupon.course ? ` · ${coupon.course.title}` : " · All courses"}
                </p>
                {coupon.expiresAt && <p>Expires {coupon.expiresAt.toLocaleDateString()}</p>}
              </div>
              <CouponStatusToggle couponId={coupon.id} active={coupon.active} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
