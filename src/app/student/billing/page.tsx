import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listOrdersForUser, confirmCheckoutSession } from "@/server/services/order-service";
import { getActiveSubscriptionForUser } from "@/server/services/subscription-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelSubscriptionButton } from "@/components/subscription/cancel-subscription-button";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PAID: "secondary",
  PENDING: "outline",
  FAILED: "destructive",
  CANCELLED: "outline",
  REFUNDED: "outline",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; session_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { session_id } = await searchParams;
  if (session_id) {
    // Fallback for environments where the Stripe webhook isn't reachable (e.g. local dev) -
    // verifies payment directly against Stripe so the order doesn't stay stuck on PENDING.
    await confirmCheckoutSession(user.id, session_id);
  }

  const [orders, subscription] = await Promise.all([
    listOrdersForUser(user.id),
    getActiveSubscriptionForUser(user.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Subscription</h2>
        {subscription ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{subscription.plan.name}</CardTitle>
              <Badge variant="secondary">{subscription.status.replace("_", " ")}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"}{" "}
                {subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toLocaleDateString() : "-"}
              </span>
              {!subscription.cancelAtPeriodEnd && <CancelSubscriptionButton />}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <p className="text-sm text-muted-foreground">No active subscription.</p>
              <Button size="sm" render={<Link href="/pricing" />}>
                View plans
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <h2 className="text-lg font-medium">Orders</h2>
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
