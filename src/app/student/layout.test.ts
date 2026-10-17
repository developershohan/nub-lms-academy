import { describe, expect, it, vi } from "vitest";

const redirectError = new Error("NEXT_REDIRECT");
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw redirectError;
  }),
}));
vi.mock("@/lib/permissions", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/services/notification-service", () => ({
  getNotificationBellProps: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
}));
vi.mock("@/components/layout/dashboard-shell", () => ({ DashboardShell: () => null }));

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import StudentLayout from "./layout";

const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>;

describe("StudentLayout", () => {
  it.each([["ADMIN"], ["TEACHER"]])("lets a %s without the STUDENT role in, to preview a course's lessons", async (role) => {
    currentUser.mockResolvedValue({ id: "user-1", roles: [role] });
    await expect(StudentLayout({ children: null })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still sends signed-out visitors to login", async () => {
    currentUser.mockResolvedValue(null);
    await expect(StudentLayout({ children: null })).rejects.toBe(redirectError);
  });
});
