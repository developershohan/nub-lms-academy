import { listOrdersForAdmin } from "@/server/services/order-service";
import { getPlatformSettings } from "@/server/services/settings-service";
import { requireAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefundOrderButton } from "@/components/admin/refund-order-button";
import { ApproveOrderButton } from "@/components/admin/approve-order-button";
import { setAutoApproveAction } from "./actions";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PAID: "secondary",
  PENDING: "outline",
  FAILED: "destructive",
  CANCELLED: "outline",
  REFUNDED: "outline",
};

export default async function AdminOrdersPage() {
  await requireAdmin();
  const [orders, settings] = await Promise.all([listOrdersForAdmin(), getPlatformSettings()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment approval</CardTitle>
          <CardDescription>
            When on, successful payments enroll the student immediately. When off, every payment
            stays pending until you approve it below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setAutoApproveAction} className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoApprove"
              name="autoApprove"
              defaultChecked={settings.autoApprovePayments}
              className="size-4"
            />
            <label htmlFor="autoApprove" className="text-sm">
              Auto-approve payments
            </label>
            <button type="submit" className="ml-2 text-sm underline underline-offset-4">
              Save
            </button>
          </form>
        </CardContent>
      </Card>

      {orders.length === 0 && <p className="text-muted-foreground">No orders yet.</p>}
      <div className="space-y-3">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {order.items.map((i) => i.course.title).join(", ")}
              </CardTitle>
              <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>{order.status}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>{order.user.name ?? order.user.email}</p>
                <p>
                  {order.createdAt.toLocaleDateString()} · ${Number(order.total).toFixed(2)}
                </p>
              </div>
              {order.status === "PENDING" && <ApproveOrderButton orderId={order.id} />}
              {order.status === "PAID" && <RefundOrderButton orderId={order.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
