-- Course page views by signed-in users, for the personalised home page ("Because you viewed").

-- CreateTable
CREATE TABLE "CourseView" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseView_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateIndex
CREATE INDEX "CourseView_userId_viewedAt_idx" ON "CourseView"("userId", "viewedAt");

-- AddForeignKey
ALTER TABLE "CourseView" ADD CONSTRAINT "CourseView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseView" ADD CONSTRAINT "CourseView_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

