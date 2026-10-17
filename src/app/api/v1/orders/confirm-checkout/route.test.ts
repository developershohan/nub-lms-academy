import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/services/order-service", () => ({ confirmCheckoutSession: vi.fn() }));

import { auth } from "@/lib/auth";
import { confirmCheckoutSession } from "@/server/services/order-service";
import { GET } from "./route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/orders/confirm-checkout", () => {
  it("confirms the Stripe session outside any page render, then redirects to billing", async () => {
    authMock.mockResolvedValue({ user: { id: "student-1" } });
    const res = await GET(new Request("http://localhost:3000/api/v1/orders/confirm-checkout?session_id=cs_123"));
    expect(confirmCheckoutSession).toHaveBeenCalledWith("student-1", "cs_123");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/student/billing?success=1");
  });

  it("sends a signed-out visitor to login and back to this route afterwards", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/v1/orders/confirm-checkout?session_id=cs_123"));
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/api/v1/orders/confirm-checkout?session_id=cs_123");
  });
});
