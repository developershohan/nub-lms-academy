import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canGenerateCertificate: vi.fn(), canAdminAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canGenerateCertificate } from "@/lib/permissions";
import { getCourseCertificateStatus } from "./certificate-service";

const prisma = prismaClient as unknown as PrismaMock;
const eligible = canGenerateCertificate as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
});

describe("getCourseCertificateStatus", () => {
  it("links to an issued certificate", async () => {
    prisma.certificate.findUnique.mockResolvedValue({ id: "cert-1", revoked: false });
    await expect(getCourseCertificateStatus("amina", "course-1")).resolves.toEqual({
      status: "issued",
      certificateId: "cert-1",
    });
  });

  it("never offers a revoked certificate again", async () => {
    prisma.certificate.findUnique.mockResolvedValue({ id: "cert-1", revoked: true });
    eligible.mockResolvedValue(true);
    await expect(getCourseCertificateStatus("amina", "course-1")).resolves.toEqual({ status: "unavailable" });
  });

  it("is ready to claim when the student has earned it, unavailable otherwise", async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);
    eligible.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(getCourseCertificateStatus("amina", "course-1")).resolves.toEqual({ status: "ready" });
    await expect(getCourseCertificateStatus("amina", "course-1")).resolves.toEqual({ status: "unavailable" });
    expect(eligible).toHaveBeenCalledWith("amina", "course-1");
  });
});
