-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'TEXT');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "targetAudience" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "language" TEXT NOT NULL DEFAULT 'English',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(10,2),
    "isSubscriptionIncluded" BOOLEAN NOT NULL DEFAULT false,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRequirement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOutcome" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LessonType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "durationSec" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'external',
    "providerAssetId" TEXT,
    "playbackUrl" TEXT NOT NULL,
    "durationSec" INTEGER,
    "status" "VideoStatus" NOT NULL DEFAULT 'READY',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");

-- CreateIndex
CREATE INDEX "Course_categoryId_idx" ON "Course"("categoryId");

-- CreateIndex
CREATE INDEX "CourseRequirement_courseId_idx" ON "CourseRequirement"("courseId");

-- CreateIndex
CREATE INDEX "CourseOutcome_courseId_idx" ON "CourseOutcome"("courseId");

-- CreateIndex
CREATE INDEX "CourseSection_courseId_idx" ON "CourseSection"("courseId");

-- CreateIndex
CREATE INDEX "Lesson_sectionId_idx" ON "Lesson"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_lessonId_key" ON "VideoAsset"("lessonId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequirement" ADD CONSTRAINT "CourseRequirement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcome" ADD CONSTRAINT "CourseOutcome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
