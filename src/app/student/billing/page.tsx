import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listOrdersForUser } from "@/server/services/order-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PAID: "secondary",
  PENDING: "outline",
  FAILED: "destructive",
  CANCELLED: "outline",
  REFUNDED: "outline",
};

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const orders = await listOrdersForUser(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
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
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{order.createdAt.toLocaleDateString()}</span>
              <span>
                {order.discountAmount && Number(order.discountAmount) > 0 && (
                  <span className="mr-2 line-through">${Number(order.subtotal).toFixed(2)}</span>
                )}
                ${Number(order.total).toFixed(2)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
