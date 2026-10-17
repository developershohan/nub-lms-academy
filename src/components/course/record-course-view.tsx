"use client";

import { useEffect } from "react";
import { recordCourseViewAction } from "@/app/(public)/courses/[slug]/actions";

/** Notes that a signed-in student opened this course page, for "Because you viewed" on their home
 * page. From the browser, not the render, so prefetching a course link never counts as a visit. */
export function RecordCourseView({ courseId }: { courseId: string }) {
  useEffect(() => {
    void recordCourseViewAction(courseId).catch(() => {
      // Best effort: a missed view only means one fewer recommendation.
    });
  }, [courseId]);
  return null;
}
