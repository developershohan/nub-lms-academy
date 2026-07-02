import { listPlansForAdmin, listSubscriptionsForAdmin } from "@/server/services/subscription-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePlanForm, PlanStatusToggle } from "@/components/admin/subscription-plan-manager";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  PAST_DUE: "destructive",
  CANCELLED: "outline",
};

export default async function AdminSubscriptionsPage() {
  const [plans, subscriptions] = await Promise.all([listPlansForAdmin(), listSubscriptionsForAdmin()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create plan</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePlanForm />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Plans</h2>
        {plans.length === 0 && <p className="text-muted-foreground">No plans yet.</p>}
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <Badge variant={plan.active ? "secondary" : "outline"}>{plan.active ? "Active" : "Inactive"}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                ${Number(plan.price).toFixed(2)} / {plan.interval === "MONTH" ? "month" : "year"}
              </span>
              <PlanStatusToggle planId={plan.id} active={plan.active} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Subscribers</h2>
        {subscriptions.length === 0 && <p className="text-muted-foreground">No subscribers yet.</p>}
        {subscriptions.map((sub) => (
          <Card key={sub.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{sub.user.name ?? sub.user.email}</CardTitle>
              <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>{sub.status.replace("_", " ")}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{sub.plan.name}</span>
              <span>
                {sub.cancelAtPeriodEnd ? "Cancels" : "Renews"}{" "}
                {sub.currentPeriodEnd ? sub.currentPeriodEnd.toLocaleDateString() : "-"}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
