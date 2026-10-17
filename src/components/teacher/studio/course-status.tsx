import type { CourseStatus } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** What each status means for the teacher, in their words - shown on the badge and the studio overview. */
export const COURSE_STATUS: Record<CourseStatus, { label: string; summary: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    summary: "Only you can see this course. Finish the checklist, then submit it for review.",
    className: "border-border bg-transparent text-muted-foreground",
  },
  IN_REVIEW: {
    label: "In review",
    summary: "An admin is reviewing the course. You'll get a notification when they decide.",
    className: "bg-amber/25 text-amber-foreground dark:text-amber",
  },
  APPROVED: {
    label: "Approved",
    summary: "The course passed review and will be published to the catalogue shortly.",
    className: "bg-amber/25 text-amber-foreground dark:text-amber",
  },
  PUBLISHED: {
    label: "Live",
    summary: "Students can find, buy and take this course.",
    className: "bg-primary text-primary-foreground",
  },
  REJECTED: {
    label: "Changes needed",
    summary: "An admin asked for changes. Fix what they noted, then submit the course again.",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
  ARCHIVED: {
    label: "Archived",
    summary: "The course is hidden from the catalogue. Enrolled students keep their access.",
    className: "bg-secondary text-secondary-foreground",
  },
};

export function CourseStatusBadge({ status, className }: { status: CourseStatus; className?: string }) {
  return <Badge className={cn(COURSE_STATUS[status].className, className)}>{COURSE_STATUS[status].label}</Badge>;
}
