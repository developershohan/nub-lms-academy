"use client";

import { useEffect } from "react";
import { recordLessonViewAction } from "@/app/student/course/[courseId]/learn/actions";

/** Tells the server which lesson is open, so the course resumes here next time. Done from the
 * browser rather than during the page render, so prefetching a lesson link never counts as a visit. */
export function RecordLessonView({ lessonId }: { lessonId: string }) {
  useEffect(() => {
    void recordLessonViewAction(lessonId).catch(() => {
      // Best effort: a missed visit only means the course resumes one lesson earlier.
    });
  }, [lessonId]);
  return null;
}
