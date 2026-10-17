-- Chat on sequence numbers: every message gets the next seq in its conversation, members keep
-- the last seq they have seen (unread = lastSeq - lastReadSeq), so per-message read receipts go.
-- Senders' clientMsgId makes retried sends idempotent, and a unique key per conversation stops
-- concurrent opens from creating duplicate DMs, course groups and support threads.
-- Existing data is backfilled in place before the constraints go on.

-- Messages: number them per conversation in the order they were sent.
ALTER TABLE "Message" ADD COLUMN "seq" INTEGER, ADD COLUMN "clientMsgId" TEXT;

UPDATE "Message" m
SET "seq" = numbered.seq
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", id) AS seq
  FROM "Message"
) numbered
WHERE m.id = numbered.id;

ALTER TABLE "Message" ALTER COLUMN "seq" SET NOT NULL;
DROP INDEX "Message_conversationId_createdAt_idx";
CREATE UNIQUE INDEX "Message_conversationId_seq_key" ON "Message"("conversationId", "seq");
CREATE UNIQUE INDEX "Message_senderId_clientMsgId_key" ON "Message"("senderId", "clientMsgId");

-- Conversations: the newest seq and when it was sent.
ALTER TABLE "Conversation"
  ADD COLUMN "lastSeq" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3),
  ADD COLUMN "uniqueKey" TEXT;

UPDATE "Conversation" c
SET "lastSeq" = latest.seq, "lastMessageAt" = latest.at
FROM (SELECT "conversationId", MAX("seq") AS seq, MAX("createdAt") AS at FROM "Message" GROUP BY "conversationId") latest
WHERE c.id = latest."conversationId";

-- Members: everything sent up to the time they last read counts as seen.
ALTER TABLE "ConversationParticipant" ADD COLUMN "lastReadSeq" INTEGER NOT NULL DEFAULT 0;

UPDATE "ConversationParticipant" p
SET "lastReadSeq" = seen.seq
FROM (
  SELECT p2.id, MAX(m."seq") AS seq
  FROM "ConversationParticipant" p2
  JOIN "Message" m ON m."conversationId" = p2."conversationId" AND m."createdAt" <= p2."lastReadAt"
  GROUP BY p2.id
) seen
WHERE p.id = seen.id;

-- Unique keys. Where earlier races already created duplicates, the oldest conversation takes the
-- key and the rest keep a null key (still readable, just no longer reused).
WITH keyed AS (
  SELECT c.id, c."createdAt",
    CASE c.type
      WHEN 'DIRECT' THEN (
        SELECT 'direct:' || string_agg("userId", ':' ORDER BY "userId")
        FROM "ConversationParticipant" WHERE "conversationId" = c.id
        HAVING COUNT(*) = 2
      )
      WHEN 'COURSE_GROUP' THEN 'course:' || c."courseId"
      WHEN 'SUPPORT' THEN (
        SELECT 'support:' || "userId"
        FROM "ConversationParticipant" WHERE "conversationId" = c.id
        ORDER BY "createdAt", id LIMIT 1
      )
    END AS key
  FROM "Conversation" c
),
ranked AS (
  SELECT id, key, ROW_NUMBER() OVER (PARTITION BY key ORDER BY "createdAt", id) AS rank
  FROM keyed WHERE key IS NOT NULL
)
UPDATE "Conversation" c SET "uniqueKey" = ranked.key
FROM ranked
WHERE c.id = ranked.id AND ranked.rank = 1;

CREATE UNIQUE INDEX "Conversation_uniqueKey_key" ON "Conversation"("uniqueKey");

-- Read receipts are replaced by lastReadSeq.
DROP TABLE "MessageReadReceipt";
