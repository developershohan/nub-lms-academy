import { listOrdersForAdmin } from "@/server/services/order-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefundOrderButton } from "@/components/admin/refund-order-button";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PAID: "secondary",
  PENDING: "outline",
  FAILED: "destructive",
  CANCELLED: "outline",
  REFUNDED: "outline",
};

export default async function AdminOrdersPage() {
  const orders = await listOrdersForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
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
              {order.status === "PAID" && <RefundOrderButton orderId={order.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
