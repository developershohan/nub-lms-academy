import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { listActivePlans, getActiveSubscriptionForUser } from "@/server/services/subscription-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscribeButton } from "@/components/subscription/subscribe-button";

export default async function PricingPage() {
  const user = await getCurrentUser();
  const [plans, activeSubscription] = await Promise.all([
    listActivePlans(),
    user ? getActiveSubscriptionForUser(user.id) : null,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        Subscribe for unlimited access to every course marked as subscription-included.
      </p>

      {plans.length === 0 && <p className="mt-8 text-muted-foreground">No plans available yet.</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = activeSubscription?.planId === plan.id;
          return (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle className="text-base">{plan.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-3xl font-semibold">
                  ${Number(plan.price).toFixed(2)}
                  <span className="text-base font-normal text-muted-foreground">
                    /{plan.interval === "MONTH" ? "mo" : "yr"}
                  </span>
                </p>
                {!user && (
                  <Button className="w-full" render={<Link href="/login?callbackUrl=/pricing" />}>
                    Log in to subscribe
                  </Button>
                )}
                {user && isCurrent && (
                  <Button className="w-full" variant="outline" disabled>
                    Current plan
                  </Button>
                )}
                {user && !isCurrent && activeSubscription && (
                  <Button className="w-full" variant="outline" render={<Link href="/student/billing" />}>
                    Manage subscription
                  </Button>
                )}
                {user && !activeSubscription && <SubscribeButton planId={plan.id} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
