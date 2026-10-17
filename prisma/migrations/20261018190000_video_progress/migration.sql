-- Video progress: where playback was and when it last reported (watch time is capped by real
-- elapsed time between reports), and an optional promo video for the course landing page.

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "promoVideoUrl" TEXT;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "lastReportAt" TIMESTAMP(3),
ADD COLUMN     "positionSec" INTEGER NOT NULL DEFAULT 0;

