import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../test/prisma-mock").then((m) => m.prismaModule()));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAccessConversation } from "./chat-store";

const prisma = prismaClient as unknown as PrismaMock;

const conversation = (type: "DIRECT" | "COURSE_GROUP" | "SUPPORT", extra: Record<string, unknown> = {}) => ({
  id: "c1",
  type,
  courseId: type === "COURSE_GROUP" ? "course-1" : null,
  channel: type === "COURSE_GROUP" ? "GENERAL" : null,
  lastSeq: 0,
  announcementOnly: false,
  slowModeSec: 0,
  participants: [],
  supportTicket: null,
  ...extra,
});
const course = (extra: Record<string, unknown> = {}) => ({
  teacherId: "teacher-1",
  status: "APPROVED",
  isSubscriptionIncluded: false,
  instructors: [],
  enrollments: [],
  ...extra,
});

beforeEach(() => prisma.$reset());

// The rules themselves live in src/server/chat/access.ts and are covered end to end by the
// integration suites; this checks the socket server's shim asks them, with no copy of its own.
describe("socket canAccessConversation", () => {
  it("lets SUPPORT staff read any conversation, matching chat:moderate in permissions.ts", async () => {
    prisma.conversation.findUnique.mockResolvedValue(conversation("SUPPORT"));
    await expect(canAccessConversation(["SUPPORT"], "support-1", "c1")).resolves.toBe(true);
    prisma.conversation.findUnique.mockResolvedValue(conversation("DIRECT"));
    await expect(canAccessConversation(["SUPPORT"], "support-1", "c1")).resolves.toBe(true);
    // No course lookups needed for staff.
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  it("keeps an enrolled student in the course chat after the course is unpublished", async () => {
    prisma.conversation.findUnique.mockResolvedValue(conversation("COURSE_GROUP"));
    prisma.course.findUnique.mockResolvedValue(course({ enrollments: [{ status: "ACTIVE" }] }));
    await expect(canAccessConversation(["STUDENT"], "student-1", "c1")).resolves.toBe(true);
  });

  it("drops a student whose enrollment was refunded, even though their participant row is still there", async () => {
    prisma.conversation.findUnique.mockResolvedValue(
      conversation("COURSE_GROUP", { participants: [{ role: "MEMBER", lastReadSeq: 3, removedAt: null, mutedUntil: null, postingBlockedUntil: null }] })
    );
    prisma.course.findUnique.mockResolvedValue(course({ enrollments: [{ status: "REFUNDED" }] }));
    await expect(canAccessConversation(["STUDENT"], "student-1", "c1")).resolves.toBe(false);
  });

  it("lets a subscriber into a subscription-included course only while it is published", async () => {
    prisma.conversation.findUnique.mockResolvedValue(conversation("COURSE_GROUP"));
    prisma.subscription.findFirst.mockResolvedValue({ id: "sub-1" });
    prisma.course.findUnique.mockResolvedValue(course({ status: "PUBLISHED", isSubscriptionIncluded: true }));
    await expect(canAccessConversation(["STUDENT"], "student-1", "c1")).resolves.toBe(true);
    prisma.course.findUnique.mockResolvedValue(course({ status: "DRAFT", isSubscriptionIncluded: true }));
    await expect(canAccessConversation(["STUDENT"], "student-1", "c1")).resolves.toBe(false);
  });

  it("still refuses a student a support ticket they are not part of", async () => {
    prisma.conversation.findUnique.mockResolvedValue(conversation("SUPPORT"));
    await expect(canAccessConversation(["STUDENT"], "student-2", "c1")).resolves.toBe(false);
  });

  it("refuses a conversation that doesn't exist", async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(canAccessConversation(["SUPER_ADMIN"], "admin-1", "missing")).resolves.toBe(false);
  });
});
