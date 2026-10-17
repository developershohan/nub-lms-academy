import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("@/server/services/order-service", () => ({ handleStripeWebhookEvent: vi.fn() }));
vi.mock("@/server/services/subscription-service", () => ({ handleSubscriptionWebhookEvent: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import { prisma as prismaClient } from "@/lib/prisma";
import { handleStripeWebhookEvent } from "@/server/services/order-service";
import { processStripeEvent } from "./stripe-webhook-service";

const prisma = prismaClient as unknown as PrismaMock;
const handleOrderEvent = handleStripeWebhookEvent as unknown as ReturnType<typeof vi.fn>;
const event = { id: "evt_1", type: "charge.refunded" } as Stripe.Event;

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
});

describe("processStripeEvent", () => {
  it("acknowledges a redelivered event without applying it again", async () => {
    prisma.stripeEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" })
    );

    await expect(processStripeEvent(event)).resolves.toEqual({ duplicate: true });
    expect(handleOrderEvent).not.toHaveBeenCalled();
  });

  it("releases the event when handling fails, so Stripe's retry is processed for real", async () => {
    prisma.stripeEvent.create.mockResolvedValue({});
    prisma.stripeEvent.delete.mockResolvedValue({});
    handleOrderEvent.mockRejectedValue(new Error("database timeout"));

    await expect(processStripeEvent(event)).rejects.toThrow("database timeout");
    expect(prisma.stripeEvent.delete).toHaveBeenCalledWith({ where: { id: "evt_1" } });
  });
});
