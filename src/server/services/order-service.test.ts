import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canAdminAccess: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/server/services/coupon-service", () => ({ validateCoupon: vi.fn(), calculateDiscount: vi.fn() }));
vi.mock("@/server/services/settings-service", () => ({
  getPlatformSettings: vi.fn().mockResolvedValue({ autoApprovePayments: true }),
}));

import { prisma as prismaClient } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { handleStripeWebhookEvent, refundOrder } from "./order-service";

const prisma = prismaClient as unknown as PrismaMock;
const getStripeClientMock = getStripeClient as unknown as ReturnType<typeof vi.fn>;

const pendingOrder = {
  id: "order-1",
  userId: "student-1",
  status: "PENDING",
  total: 49.99,
  currency: "usd",
  couponId: null,
  stripePaymentIntentId: null,
  items: [{ courseId: "course-1" }],
};

const completedEvent = (id: string) =>
  ({
    id,
    type: "checkout.session.completed",
    data: { object: { metadata: { orderId: "order-1" }, payment_intent: "pi_1" } },
  }) as unknown as Stripe.Event;

beforeEach(() => {
  prisma.$reset();
  getStripeClientMock.mockReset();
});

describe("markOrderPaid (via the Stripe webhook)", () => {
  it("claims the order with a conditional PENDING -> PAID update inside the transaction", async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder);
    prisma.order.updateMany.mockResolvedValue({ count: 1 });

    await handleStripeWebhookEvent(completedEvent("evt_1"));

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING" },
      data: { status: "PAID", stripePaymentIntentId: "pi_1" },
    });
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.upsert).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a concurrent confirmation already claimed the order", async () => {
    // Both callers read PENDING before either transaction commits - only the conditional update
    // inside the transaction can tell them apart.
    prisma.order.findUnique.mockResolvedValue(pendingOrder);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await handleStripeWebhookEvent(completedEvent("evt_2"));

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it("never flips a refunded order back to PAID on webhook redelivery", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...pendingOrder, status: "REFUNDED" });

    await handleStripeWebhookEvent(completedEvent("evt_3"));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });
});

describe("refundOrder", () => {
  const paidOrder = { ...pendingOrder, status: "PAID", stripePaymentIntentId: "pi_1" };

  it("fails instead of marking the order refunded when Stripe isn't configured", async () => {
    prisma.order.findUnique.mockResolvedValue(paidOrder);
    getStripeClientMock.mockReturnValue(null);

    const result = await refundOrder("admin-1", "order-1");

    expect(result).toHaveProperty("error");
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it("fails for a paid order with no recorded Stripe payment", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...paidOrder, stripePaymentIntentId: null });

    const result = await refundOrder("admin-1", "order-1");

    expect(result).toHaveProperty("error");
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("refunds through Stripe before marking the order refunded", async () => {
    const refundsCreate = vi.fn().mockResolvedValue({});
    getStripeClientMock.mockReturnValue({ refunds: { create: refundsCreate } });
    prisma.order.findUnique.mockResolvedValue(paidOrder);

    await expect(refundOrder("admin-1", "order-1")).resolves.toEqual({ ok: true });

    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: "order-1" }, data: { status: "REFUNDED" } });
  });

  it("still refunds a $0 coupon order locally, since it never went through Stripe", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...paidOrder, total: 0, stripePaymentIntentId: null });

    await expect(refundOrder("admin-1", "order-1")).resolves.toEqual({ ok: true });
    expect(getStripeClientMock).not.toHaveBeenCalled();
  });
});
