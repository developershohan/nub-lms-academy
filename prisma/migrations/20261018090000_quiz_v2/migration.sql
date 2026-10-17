-- Quiz v2: per-attempt snapshots (so quiz edits never rewrite history), a server-side deadline,
-- shuffling, question banks, partial credit, retake cooldowns, and two new question types.
-- QuizAnswer loses its foreign key to Question: answers now point into the attempt snapshot,
-- and deleting a question must not cascade into past attempts.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'FILL_BLANK';
ALTER TYPE "QuestionType" ADD VALUE 'ORDERING';

-- DropForeignKey
ALTER TABLE "QuizAnswer" DROP CONSTRAINT "QuizAnswer_questionId_fkey";

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "drawCount" INTEGER,
ADD COLUMN     "partialCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retakeCooldownMin" INTEGER,
ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "pointsEarned" DOUBLE PRECISION,
ADD COLUMN     "pointsPossible" DOUBLE PRECISION,
ADD COLUMN     "snapshot" JSONB;

-- AlterTable
ALTER TABLE "QuizAnswer" ADD COLUMN     "pointsAwarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "textAnswer" TEXT;

