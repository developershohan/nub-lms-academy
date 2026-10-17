-- Phase 2, part two: course community channels, participant roles, replies/edits/reactions,
-- blocks and reports, support tickets, web push subscriptions, delivery stamps for chat digests,
-- and lesson Q&A. Everything is additive; existing rows are backfilled below.

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('GENERAL', 'ANNOUNCEMENTS', 'QA', 'BATCH');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('MESSAGE', 'USER', 'REVIEW');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- DropIndex
DROP INDEX "ConversationParticipant_userId_idx";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "announcementOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel" "ConversationChannel",
ADD COLUMN     "pinnedMessageId" TEXT,
ADD COLUMN     "slowModeSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "postingBlockedUntil" TIMESTAMP(3),
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT,
ADD COLUMN     "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "pushedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "push" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "targetType" "ReportTargetType" NOT NULL,
    "messageId" TEXT,
    "targetUserId" TEXT,
    "reviewId" TEXT,
    "reason" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "subject" TEXT,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "firstResponseAt" TIMESTAMP(3),
    "lastCustomerMessageAt" TIMESTAMP(3),
    "lastStaffMessageAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonQuestion" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3),
    "acceptedAnswerId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInstructor" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonQuestionVote" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonQuestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_messageId_key" ON "Report"("reporterId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_conversationId_key" ON "SupportTicket"("conversationId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_updatedAt_idx" ON "SupportTicket"("status", "priority", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_status_idx" ON "SupportTicket"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_requesterId_idx" ON "SupportTicket"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "LessonQuestion_lessonId_createdAt_idx" ON "LessonQuestion"("lessonId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonQuestion_courseId_answeredAt_idx" ON "LessonQuestion"("courseId", "answeredAt");

-- CreateIndex
CREATE INDEX "LessonQuestion_userId_idx" ON "LessonQuestion"("userId");

-- CreateIndex
CREATE INDEX "LessonAnswer_questionId_createdAt_idx" ON "LessonAnswer"("questionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonQuestionVote_questionId_userId_key" ON "LessonQuestionVote"("questionId", "userId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_removedAt_idx" ON "ConversationParticipant"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "Notification_type_status_pushedAt_idx" ON "Notification"("type", "status", "pushedAt");

-- CreateIndex
CREATE INDEX "Notification_type_status_emailedAt_idx" ON "Notification"("type", "status", "emailedAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestion" ADD CONSTRAINT "LessonQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestion" ADD CONSTRAINT "LessonQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestion" ADD CONSTRAINT "LessonQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAnswer" ADD CONSTRAINT "LessonAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "LessonQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAnswer" ADD CONSTRAINT "LessonAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestionVote" ADD CONSTRAINT "LessonQuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "LessonQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestionVote" ADD CONSTRAINT "LessonQuestionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: every course group so far is its course community's #general channel.
UPDATE "Conversation" SET "channel" = 'GENERAL' WHERE "type" = 'COURSE_GROUP' AND "channel" IS NULL;

-- Backfill 2: roles. The course's teacher owns its channels, co-instructors moderate them, and the
-- person who opened a support thread ("support:<userId>") owns that thread.
UPDATE "ConversationParticipant" p
SET "role" = 'MODERATOR'
FROM "Conversation" c
JOIN "CourseInstructor" ci ON ci."courseId" = c."courseId"
WHERE p."conversationId" = c.id AND c."type" = 'COURSE_GROUP' AND ci."userId" = p."userId";

UPDATE "ConversationParticipant" p
SET "role" = 'OWNER'
FROM "Conversation" c
JOIN "Course" co ON co.id = c."courseId"
WHERE p."conversationId" = c.id AND c."type" = 'COURSE_GROUP' AND co."teacherId" = p."userId";

UPDATE "ConversationParticipant" p
SET "role" = 'OWNER'
FROM "Conversation" c
WHERE p."conversationId" = c.id AND c."type" = 'SUPPORT' AND c."uniqueKey" = 'support:' || p."userId";

-- Backfill 3: a ticket for every support thread. The requester is the key's user (or, for a
-- legacy duplicate without a key, the first participant); it waits on staff unless staff wrote last.
INSERT INTO "SupportTicket" (
    "id", "conversationId", "requesterId", "status", "priority", "subject",
    "lastCustomerMessageAt", "lastStaffMessageAt", "firstResponseAt", "createdAt", "updatedAt"
)
SELECT 'mig' || md5('ticket:' || c.id), c.id, requester."userId",
       CASE WHEN times.staff_last IS NOT NULL AND (times.customer_last IS NULL OR times.staff_last > times.customer_last)
            THEN 'PENDING'::"SupportTicketStatus" ELSE 'OPEN'::"SupportTicketStatus" END,
       'NORMAL', LEFT(first_msg.content, 120),
       times.customer_last, times.staff_last, times.staff_first, c."createdAt", c."updatedAt"
FROM "Conversation" c
JOIN LATERAL (
  SELECT p."userId" FROM "ConversationParticipant" p
  WHERE p."conversationId" = c.id
  ORDER BY (c."uniqueKey" = 'support:' || p."userId") DESC NULLS LAST, p."createdAt", p.id
  LIMIT 1
) requester ON true
JOIN LATERAL (
  SELECT MAX(m."createdAt") FILTER (WHERE m."senderId" = requester."userId") AS customer_last,
         MAX(m."createdAt") FILTER (WHERE m."senderId" <> requester."userId") AS staff_last,
         MIN(m."createdAt") FILTER (WHERE m."senderId" <> requester."userId") AS staff_first
  FROM "Message" m
  WHERE m."conversationId" = c.id
) times ON true
LEFT JOIN LATERAL (
  SELECT m.content FROM "Message" m
  WHERE m."conversationId" = c.id AND m."senderId" = requester."userId" AND m."deletedAt" IS NULL
  ORDER BY m."seq" LIMIT 1
) first_msg ON true
WHERE c."type" = 'SUPPORT';

-- Backfill 4: message reports move to Report rows (the old columns never recorded who reported).
INSERT INTO "Report" ("id", "reporterId", "targetType", "messageId", "targetUserId", "reason", "status", "createdAt")
SELECT 'mig' || md5('report:' || m.id), NULL, 'MESSAGE', m.id, m."senderId", m."reportReason", 'OPEN', m."reportedAt"
FROM "Message" m
WHERE m."reportedAt" IS NOT NULL;
