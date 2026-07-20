-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Course_status_isFeatured_idx" ON "Course"("status", "isFeatured");
