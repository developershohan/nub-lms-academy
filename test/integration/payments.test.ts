import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// Stripe's API is the one outside service faked here; everything on our side is real.
const stripe = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  refunds: { create: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: () => stripe }));

import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { canAccessCourse } from "@/lib/permissions";
import { confirmCheckoutSession, createCheckoutSession, refundOrder } from "@/server/services/order-service";
import { processStripeEvent } from "@/server/services/stripe-webhook-service";
import { createCourse, createUser, resetDatabase } from "./db";

const event = (id: string, type: string, object: Record<string, unknown>) =>
  ({ id, type, data: { object } }) as unknown as Stripe.Event;
const checkoutCompleted = (id: string, orderId: string) =>
  event(id, "checkout.session.completed", { metadata: { orderId }, payment_intent: "pi_1" });

async function startCheckout() {
  const teacher = await createUser(["TEACHER"]);
  const student = await createUser();
  const course = await createCourse(teacher.id, { price: 49.99 });
  stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });

  const result = await createCheckoutSession(student.id, course.id);
  expect(result).toMatchObject({ ok: true });
  const order = await prisma.order.findFirstOrThrow({ where: { userId: student.id } });
  return { student, course, order };
}

async function paidOrder() {
  const checkout = await startCheckout();
  await processStripeEvent(checkoutCompleted("evt_paid", checkout.order.id));
  return checkout;
}

const paymentsWithStatus = (orderId: string, status: "PAID" | "REFUNDED" | "DISPUTED") =>
  prisma.payment.count({ where: { orderId, status } });

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe("checkout", () => {
  it("creates one Stripe session per order and enrolls the student when the webhook confirms payment", async () => {
    const { student, course, order } = await startCheckout();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: `checkout-session:${order.id}`,
    });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(false);

    await processStripeEvent(checkoutCompleted("evt_paid", order.id));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: "PAID" });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
  });

  it("records the payment once when another server process marks the order paid mid-flight", async () => {
    // The webhook and the success-page confirmation usually run in different server processes.
    // Play the other process on its own connection: it has marked the order PAID but not yet
    // committed, so the webhook still reads PENDING and then waits on the row lock - exactly the
    // window the old check-then-write markOrderPaid recorded a second payment in.
    const { student, order } = await startCheckout();
    const otherProcess = new Client({ connectionString: process.env.DATABASE_URL });
    await otherProcess.connect();
    await otherProcess.query("BEGIN");
    await otherProcess.query(`UPDATE "Order" SET status = 'PAID' WHERE id = $1`, [order.id]);
    await otherProcess.query(
      `INSERT INTO "Payment" (id, "orderId", amount, currency, status) VALUES ('pay_other', $1, 49.99, 'usd', 'PAID')`,
      [order.id]
    );

    const webhook = processStripeEvent(checkoutCompleted("evt_paid", order.id));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await otherProcess.query("COMMIT");
    await otherProcess.end();
    await webhook;

    await expect(paymentsWithStatus(order.id, "PAID")).resolves.toBe(1);
    await expect(prisma.enrollment.count({ where: { userId: student.id } })).resolves.toBe(0);
  });

  it("confirms from the success page when the webhook hasn't arrived, and not again after it", async () => {
    const { student, course, order } = await startCheckout();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ payment_status: "paid", payment_intent: "pi_1" });

    await expect(confirmCheckoutSession(student.id, "cs_1")).resolves.toEqual({ ok: true, status: "PAID" });
    await processStripeEvent(checkoutCompleted("evt_paid", order.id));

    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
    await expect(paymentsWithStatus(order.id, "PAID")).resolves.toBe(1);
  });

  it("applies a redelivered webhook event only once", async () => {
    const { order } = await startCheckout();

    await expect(processStripeEvent(checkoutCompleted("evt_paid", order.id))).resolves.toEqual({ duplicate: false });
    await expect(processStripeEvent(checkoutCompleted("evt_paid", order.id))).resolves.toEqual({ duplicate: true });

    await expect(paymentsWithStatus(order.id, "PAID")).resolves.toBe(1);
    await expect(prisma.stripeEvent.count()).resolves.toBe(1);
  });

  it("enrolls immediately, without Stripe, when a coupon brings the total to $0", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id, { price: 30 });
    await prisma.coupon.create({ data: { code: "FREE100", discountType: "PERCENTAGE", discountValue: 100 } });

    await expect(createCheckoutSession(student.id, course.id, "free100")).resolves.toMatchObject({ freeViaCoupon: true });

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
    await expect(prisma.couponRedemption.count({ where: { userId: student.id } })).resolves.toBe(1);
  });
});

describe("refunds", () => {
  it("ends access when the payment is fully refunded in the Stripe dashboard", async () => {
    const { student, course, order } = await paidOrder();

    await processStripeEvent(event("evt_refund", "charge.refunded", { refunded: true, payment_intent: "pi_1" }));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: "REFUNDED" });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(false);
  });

  it("keeps access after a partial refund", async () => {
    const { student, course } = await paidOrder();

    await processStripeEvent(event("evt_partial", "charge.refunded", { refunded: false, payment_intent: "pi_1" }));

    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
  });

  it("records an admin refund once, even when Stripe's charge.refunded webhook follows it", async () => {
    const admin = await createUser(["ADMIN"]);
    const { order } = await paidOrder();
    stripe.refunds.create.mockResolvedValue({ id: "re_1" });

    await expect(refundOrder(admin.id, order.id)).resolves.toEqual({ ok: true });
    await processStripeEvent(event("evt_refund", "charge.refunded", { refunded: true, payment_intent: "pi_1" }));

    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: `refund:${order.id}` });
    await expect(paymentsWithStatus(order.id, "REFUNDED")).resolves.toBe(1);
  });
});

describe("disputes", () => {
  it("suspends access while a chargeback is open and alerts admins", async () => {
    const admin = await createUser(["ADMIN"]);
    const { student, course, order } = await paidOrder();

    await processStripeEvent(event("evt_dispute", "charge.dispute.created", { payment_intent: "pi_1", status: "needs_response" }));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: "DISPUTED" });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(false);
    await expect(prisma.notification.count({ where: { userId: admin.id, type: "payment-dispute" } })).resolves.toBe(1);
  });

  it("restores access when the dispute is won", async () => {
    const { student, course, order } = await paidOrder();
    await processStripeEvent(event("evt_dispute", "charge.dispute.created", { payment_intent: "pi_1", status: "needs_response" }));

    await processStripeEvent(event("evt_won", "charge.dispute.closed", { payment_intent: "pi_1", status: "won" }));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: "PAID" });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(true);
  });

  it("refunds the order when the dispute is lost", async () => {
    const { student, course, order } = await paidOrder();
    await processStripeEvent(event("evt_dispute", "charge.dispute.created", { payment_intent: "pi_1", status: "needs_response" }));

    await processStripeEvent(event("evt_lost", "charge.dispute.closed", { payment_intent: "pi_1", status: "lost" }));

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: "REFUNDED" });
    await expect(canAccessCourse(student.id, course.id)).resolves.toBe(false);
  });
});
