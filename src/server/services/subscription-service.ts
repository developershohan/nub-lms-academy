import "server-only";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { SubscriptionPlanInput } from "@/lib/validations/subscription";

function revalidateSubscriptionPaths() {
  revalidatePath("/student/billing");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/pricing");
}

export function listActivePlans() {
  return prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { price: "asc" } });
}

export function listPlansForAdmin() {
  return prisma.subscriptionPlan.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createPlan(actorId: string, data: SubscriptionPlanInput) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const plan = await prisma.subscriptionPlan.create({ data });
  await logAudit(actorId, "subscription-plan:create", "SubscriptionPlan", plan.id, { name: plan.name });
  revalidateSubscriptionPaths();
  return { ok: true, plan } as const;
}

export async function setPlanActive(actorId: string, planId: string, active: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { active } });
  await logAudit(actorId, active ? "subscription-plan:activate" : "subscription-plan:deactivate", "SubscriptionPlan", planId);
  revalidateSubscriptionPaths();
  return { ok: true } as const;
}

export function getActiveSubscriptionForUser(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
  });
}

export function listSubscriptionsForUser(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

export function listSubscriptionsForAdmin() {
  return prisma.subscription.findMany({
    include: { plan: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Stripe Checkout in subscription mode - the plan's price/interval is sent as recurring
 * price_data (same "no pre-created Stripe Price" approach as one-time course checkout), and the
 * userId/planId are stamped onto the Stripe subscription's own metadata so the webhook can link
 * it back to our rows without needing to correlate through the checkout session. */
export async function createSubscriptionCheckoutSession(userId: string, planId: string) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) return { error: "Plan not available" } as const;

  const existing = await getActiveSubscriptionForUser(userId);
  if (existing) return { error: "You already have an active subscription" } as const;

  const stripe = getStripeClient();
  if (!stripe) return { error: "Payments aren't configured yet" } as const;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(plan.price) * 100),
            product_data: { name: plan.name },
            recurring: { interval: plan.interval === "MONTH" ? "month" : "year" },
          },
          quantity: 1,
        },
      ],
      subscription_data: { metadata: { userId, planId } },
      success_url: `${baseUrl}/student/billing?success=1`,
      cancel_url: `${baseUrl}/pricing`,
    });
    return { ok: true, checkoutUrl: session.url! } as const;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout" } as const;
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELLED" {
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "past_due") return "PAST_DUE";
  return "CANCELLED";
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const planId = subscription.metadata?.planId;
  if (!userId || !planId) return; // not one of ours

  const periodEnd = subscription.items.data[0]?.current_period_end;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId,
      planId,
      status: mapStripeStatus(subscription.status),
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  revalidateSubscriptionPaths();
}

async function markSubscriptionEnded(subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: "CANCELLED", cancelAtPeriodEnd: true },
  });
  revalidateSubscriptionPaths();
}

/** Call from the webhook route only, alongside order-service's handler - each ignores event
 * types it doesn't own so both can subscribe to the same endpoint. */
export async function handleSubscriptionWebhookEvent(event: Stripe.Event) {
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
  } else if (event.type === "customer.subscription.deleted") {
    await markSubscriptionEnded(event.data.object as Stripe.Subscription);
  }
}

/** Cancels at the end of the current billing period (access continues until then) rather than
 * immediately, so the student doesn't lose access mid-period they already paid for. Reads
 * cancelAtPeriodEnd back from Stripe's response instead of guessing, so the UI update in the
 * same request is accurate even before the webhook arrives. */
export async function cancelSubscription(userId: string) {
  const subscription = await getActiveSubscriptionForUser(userId);
  if (!subscription) return { error: "No active subscription" } as const;
  if (!subscription.stripeSubscriptionId) return { error: "Subscription not linked to Stripe" } as const;

  const stripe = getStripeClient();
  if (!stripe) return { error: "Payments aren't configured yet" } as const;

  try {
    const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: updated.cancel_at_period_end },
    });
    revalidateSubscriptionPaths();
    return { ok: true } as const;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel subscription" } as const;
  }
}
