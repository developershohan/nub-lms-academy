import "server-only";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { validateCoupon, calculateDiscount } from "@/server/services/coupon-service";
import { getPlatformSettings } from "@/server/services/settings-service";

function revalidateOrderPaths() {
  revalidatePath("/student/billing");
  revalidatePath("/admin/orders");
}

/** Creates a PENDING order + Stripe Checkout session, or - if a coupon brings the total to $0 -
 * skips Stripe entirely and marks the order paid/enrolled immediately. */
export async function createCheckoutSession(userId: string, courseId: string, couponCode?: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "PUBLISHED") return { error: "Course not available" } as const;

  const subtotal = Number(course.salePrice ?? course.price);
  if (subtotal <= 0) return { error: "This course is free - use the enroll button instead" } as const;

  const existingEnrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existingEnrollment?.status === "ACTIVE") return { error: "Already enrolled" } as const;

  let discountAmount = 0;
  let couponId: string | undefined;
  if (couponCode) {
    const result = await validateCoupon(couponCode, userId, courseId);
    if ("error" in result) return { error: result.error } as const;
    discountAmount = calculateDiscount(result.coupon, subtotal);
    couponId = result.coupon.id;
  }

  const total = Math.max(0, subtotal - discountAmount);

  const order = await prisma.order.create({
    data: {
      userId,
      subtotal,
      discountAmount,
      total,
      couponId,
      items: { create: [{ courseId, price: subtotal }] },
    },
  });

  if (total === 0) {
    await markOrderPaid(order.id, {});
    return { ok: true, freeViaCoupon: true } as const;
  }

  const stripe = getStripeClient();
  if (!stripe) return { error: "Payments aren't configured yet" } as const;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: order.currency,
            unit_amount: Math.round(total * 100),
            product_data: { name: course.title },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/student/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/courses/${course.slug}`,
      metadata: { orderId: order.id },
    });

    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
    return { ok: true, checkoutUrl: session.url! } as const;
  } catch (err) {
    // The PENDING order stays as a record of the attempt; nothing was charged.
    return { error: err instanceof Error ? err.message : "Could not start checkout" } as const;
  }
}

async function markOrderPaid(orderId: string, event: { id?: string; paymentIntentId?: string | null }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.status === "PAID") return; // already processed - webhook redelivery is normal

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "PAID", stripePaymentIntentId: event.paymentIntentId ?? undefined },
    });
    await tx.payment.create({
      data: {
        orderId,
        amount: order.total,
        currency: order.currency,
        status: "PAID",
        stripeEventId: event.id,
      },
    });
    for (const item of order.items) {
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: order.userId, courseId: item.courseId } },
        create: { userId: order.userId, courseId: item.courseId, source: "PURCHASE" },
        update: { status: "ACTIVE", source: "PURCHASE" },
      });
    }
    if (order.couponId) {
      await tx.couponRedemption.upsert({
        where: { orderId },
        create: { couponId: order.couponId, userId: order.userId, orderId },
        update: {},
      });
    }
  });

  revalidateOrderPaths();
  revalidatePath("/student/my-courses");
  revalidatePath("/student/dashboard");
}

async function recordCapturedPaymentIntent(orderId: string, paymentIntentId: string | null) {
  if (!paymentIntentId) return;
  await prisma.order.update({ where: { id: orderId }, data: { stripePaymentIntentId: paymentIntentId } });
}

/** Called from the checkout success redirect as a fallback for environments where the Stripe
 * webhook isn't wired up (e.g. local dev) - verifies payment directly against Stripe instead of
 * waiting for the webhook, then finalizes the order the same way the webhook would. */
export async function confirmCheckoutSession(userId: string, stripeSessionId: string) {
  const order = await prisma.order.findUnique({ where: { stripeCheckoutSessionId: stripeSessionId } });
  if (!order || order.userId !== userId) return { error: "Not found" } as const;
  if (order.status !== "PENDING") return { ok: true, status: order.status } as const;

  const stripe = getStripeClient();
  if (!stripe) return { error: "Payments aren't configured yet" } as const;

  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  if (session.payment_status !== "paid") return { ok: true, status: order.status } as const;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const settings = await getPlatformSettings();
  if (settings.autoApprovePayments) {
    await markOrderPaid(order.id, { paymentIntentId });
    return { ok: true, status: "PAID" } as const;
  }

  // Payment was captured by Stripe but enrollment is deferred until an admin approves it.
  await recordCapturedPaymentIntent(order.id, paymentIntentId);
  return { ok: true, status: "PENDING" } as const;
}

/** Admin override for orders left PENDING - either because auto-approve is off, or because the
 * webhook/confirmation fallback never ran. Idempotent: re-approving an already-PAID order is a no-op. */
export async function adminMarkOrderPaid(actorId: string, orderId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Not found" } as const;
  if (order.status === "PAID") return { ok: true } as const;
  if (order.status !== "PENDING") return { error: "Only pending orders can be approved" } as const;

  await markOrderPaid(orderId, { paymentIntentId: order.stripePaymentIntentId });
  await logAudit(actorId, "order:approve", "Order", orderId);
  return { ok: true } as const;
}

async function markOrderFailed(orderId: string, event: { id?: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING") return;

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: "FAILED" } }),
    prisma.payment.create({
      data: { orderId, amount: order.total, currency: order.currency, status: "FAILED", stripeEventId: event.id },
    }),
  ]);
  revalidateOrderPaths();
}

/** Verifies the Stripe signature and dispatches to the right handler - call this from the
 * webhook route only; every other order-status change should go through here for a single
 * source of truth on how orders transition to PAID/FAILED. */
export async function handleStripeWebhookEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    if (orderId) {
      const settings = await getPlatformSettings();
      if (settings.autoApprovePayments) {
        await markOrderPaid(orderId, { id: event.id, paymentIntentId });
      } else {
        // Payment captured, but enrollment is deferred until an admin approves it manually.
        await recordCapturedPaymentIntent(orderId, paymentIntentId);
      }
    }
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId) await markOrderFailed(orderId, { id: event.id });
  }
}

export function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: { include: { course: { select: { title: true, slug: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderForUser(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { course: { select: { title: true, slug: true } } } } },
  });
  if (!order || order.userId !== userId) return null;
  return order;
}

export function listOrdersForAdmin() {
  return prisma.order.findMany({
    include: {
      user: { select: { name: true, email: true } },
      items: { include: { course: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function refundOrder(actorId: string, orderId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { error: "Not found" } as const;
  if (order.status !== "PAID") return { error: "Only paid orders can be refunded" } as const;

  if (order.stripePaymentIntentId) {
    const stripe = getStripeClient();
    if (stripe) {
      try {
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Stripe refund failed" } as const;
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
    await tx.payment.create({
      data: { orderId, amount: order.total, currency: order.currency, status: "REFUNDED" },
    });
    for (const item of order.items) {
      await tx.enrollment.updateMany({
        where: { userId: order.userId, courseId: item.courseId },
        data: { status: "REFUNDED" },
      });
    }
  });

  await logAudit(actorId, "order:refund", "Order", orderId);
  revalidateOrderPaths();
  revalidatePath("/student/my-courses");
  return { ok: true } as const;
}
