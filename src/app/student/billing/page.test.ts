import { describe, expect, it, vi } from "vitest";

const redirectError = new Error("NEXT_REDIRECT");
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw redirectError;
  }),
}));
vi.mock("@/lib/permissions", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "student-1" }) }));
vi.mock("@/server/services/order-service", () => ({
  listOrdersForUser: vi.fn().mockResolvedValue([]),
  confirmCheckoutSession: vi.fn(),
}));
vi.mock("@/server/services/subscription-service", () => ({
  getActiveSubscriptionForUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/components/subscription/cancel-subscription-button", () => ({ CancelSubscriptionButton: () => null }));

import { redirect } from "next/navigation";
import { confirmCheckoutSession } from "@/server/services/order-service";
import BillingPage from "./page";

describe("BillingPage", () => {
  it("never confirms a checkout session during render - it hands legacy success links to the route", async () => {
    await expect(BillingPage({ searchParams: Promise.resolve({ session_id: "cs_123" }) })).rejects.toBe(redirectError);
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/api/v1/orders/confirm-checkout?session_id=cs_123");
  });
});
