import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { processStripeEvent } from "@/server/services/stripe-webhook-service";

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

  try {
    const { duplicate } = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate });
  } catch (err) {
    // A non-2xx makes Stripe retry the delivery later (processStripeEvent released the event).
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
