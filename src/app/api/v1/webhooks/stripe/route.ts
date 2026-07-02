import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { handleStripeWebhookEvent } from "@/server/services/order-service";
import { handleSubscriptionWebhookEvent } from "@/server/services/subscription-service";

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Payments aren't configured yet" }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  await handleStripeWebhookEvent(event);
  return NextResponse.json({ received: true });
}
