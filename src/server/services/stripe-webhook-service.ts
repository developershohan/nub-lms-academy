import "server-only";
import type Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handleStripeWebhookEvent } from "@/server/services/order-service";
import { handleSubscriptionWebhookEvent } from "@/server/services/subscription-service";

/**
 * Applies a verified Stripe event at most once. Stripe delivers at least once (and retries on any
 * non-2xx), so the event id is claimed in the StripeEvent table first: a redelivery - or a second
 * concurrent delivery - finds it already claimed and is acknowledged without being applied again.
 * If handling throws, the claim is released so Stripe's retry gets a real second attempt.
 *
 * Order and subscription handlers each ignore event types they don't own, so both always run.
 */
export async function processStripeEvent(event: Stripe.Event) {
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { duplicate: true } as const;
    }
    throw err;
  }

  try {
    await handleStripeWebhookEvent(event);
    await handleSubscriptionWebhookEvent(event);
  } catch (err) {
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
  return { duplicate: false } as const;
}
