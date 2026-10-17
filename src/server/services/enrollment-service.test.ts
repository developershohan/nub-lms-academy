import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canManageCourse: vi.fn(), canAdminAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/server/services/notification-service", () => ({ notify: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAdminAccess, canManageCourse } from "@/lib/permissions";
import { enrollUserByEmail } from "./enrollment-service";

const prisma = prismaClient as unknown as PrismaMock;
const asAdmin = canAdminAccess as unknown as ReturnType<typeof vi.fn>;
const asTeacher = canManageCourse as unknown as ReturnType<typeof vi.fn>;

function givenCourse(price: number, salePrice: number | null = null) {
  prisma.course.findUnique.mockResolvedValue({ title: "Web Basics", slug: "web-basics", price, salePrice });
  prisma.user.findUnique.mockResolvedValue({ id: "student-1", status: "ACTIVE" });
  prisma.enrollment.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
});

describe("enrollUserByEmail", () => {
  it("stops a teacher from giving free access to their paid course", async () => {
    asAdmin.mockResolvedValue(false);
    asTeacher.mockResolvedValue(true);
    givenCourse(49.99);

    await expect(enrollUserByEmail("teacher-1", "course-1", "s@example.com")).resolves.toEqual({
      error: "Only an admin can give free access to a paid course",
    });
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it("still lets a teacher enroll someone in their free course", async () => {
    asAdmin.mockResolvedValue(false);
    asTeacher.mockResolvedValue(true);
    givenCourse(49.99, 0);

    await expect(enrollUserByEmail("teacher-1", "course-1", "s@example.com")).resolves.toEqual({ ok: true });
  });

  it("lets an admin grant a paid course", async () => {
    asAdmin.mockResolvedValue(true);
    givenCourse(49.99);

    await expect(enrollUserByEmail("admin-1", "course-1", "s@example.com")).resolves.toEqual({ ok: true });
    expect(prisma.enrollment.upsert).toHaveBeenCalled();
  });
});
