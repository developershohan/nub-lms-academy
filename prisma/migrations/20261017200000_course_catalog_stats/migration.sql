-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "effectivePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lessonCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalDurationSec" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Course_status_ratingAvg_idx" ON "Course"("status", "ratingAvg");

-- CreateIndex
CREATE INDEX "Course_status_effectivePrice_idx" ON "Course"("status", "effectivePrice");


-- Backfill the new catalogue columns for existing courses.
UPDATE "Course" SET "effectivePrice" = COALESCE("salePrice", "price");

UPDATE "Course" AS c
SET "ratingAvg" = r.avg, "ratingCount" = r.cnt
FROM (
  SELECT "courseId", ROUND(AVG("rating")::numeric, 2)::double precision AS avg, COUNT(*)::integer AS cnt
  FROM "CourseReview"
  WHERE "hidden" = false
  GROUP BY "courseId"
) AS r
WHERE r."courseId" = c."id";

UPDATE "Course" AS c
SET "totalDurationSec" = l.total, "lessonCount" = l.cnt
FROM (
  SELECT s."courseId", COALESCE(SUM(l."durationSec"), 0)::integer AS total, COUNT(*)::integer AS cnt
  FROM "Lesson" AS l
  JOIN "CourseSection" AS s ON s."id" = l."sectionId"
  GROUP BY s."courseId"
) AS l
WHERE l."courseId" = c."id";
