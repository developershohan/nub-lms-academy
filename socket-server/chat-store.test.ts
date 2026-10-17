import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../test/prisma-mock").then((m) => m.prismaModule()));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAccessConversation } from "./chat-store";

const prisma = prismaClient as unknown as PrismaMock;

beforeEach(() => prisma.$reset());

describe("socket canAccessConversation", () => {
  it("lets SUPPORT staff into any conversation, matching chat:moderate in permissions.ts", async () => {
    await expect(canAccessConversation(["SUPPORT"], "support-1", "ticket-1")).resolves.toBe(true);
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("keeps an enrolled student in the course chat after the course is unpublished", async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: "c1", type: "COURSE_GROUP", courseId: "course-1" });
    prisma.course.findUnique.mockResolvedValue({ teacherId: "teacher-1", status: "APPROVED", isSubscriptionIncluded: false });
    prisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE" });
    await expect(canAccessConversation(["STUDENT"], "student-1", "c1")).resolves.toBe(true);
  });

  it("still refuses a student a support ticket they are not part of", async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: "ticket-1", type: "SUPPORT", courseId: null });
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);
    await expect(canAccessConversation(["STUDENT"], "student-2", "ticket-1")).resolves.toBe(false);
  });
});
