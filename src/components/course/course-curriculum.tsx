import { ChevronDown, FileText, PlayCircle } from "lucide-react";
import { formatLessonDuration, formatTotalDuration } from "@/lib/format";
import { LessonPreviewDialog } from "@/components/course/lesson-preview-dialog";
import type { LessonPreview } from "@/server/services/course-landing-service";

type Section = {
  id: string;
  title: string;
  lessons: { id: string; title: string; type: "VIDEO" | "TEXT"; durationSec: number | null; isPreview: boolean }[];
};

/** Course content as an accordion (native <details>, so it works without JavaScript and with the
 * keyboard): section and lesson counts, lengths, and free previews that open in a modal. */
export function CourseCurriculum({
  sections,
  previews,
  stats,
}: {
  sections: Section[];
  previews: Map<string, LessonPreview>;
  stats: { sectionCount: number; lessonCount: number; totalDurationSec: number };
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {stats.sectionCount} {stats.sectionCount === 1 ? "section" : "sections"} · {stats.lessonCount}{" "}
        {stats.lessonCount === 1 ? "lesson" : "lessons"}
        {stats.totalDurationSec > 0 && ` · ${formatTotalDuration(stats.totalDurationSec)} total length`}
      </p>
      <div className="divide-y overflow-hidden rounded-xl border">
        {sections.map((section, index) => {
          const sectionSec = section.lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
          return (
            <details key={section.id} className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-3 bg-muted/40 px-4 py-3 hover:bg-muted/70 [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
                <span className="flex-1 font-medium">{section.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {section.lessons.length} {section.lessons.length === 1 ? "lesson" : "lessons"}
                  {sectionSec > 0 && ` · ${formatTotalDuration(sectionSec)}`}
                </span>
              </summary>
              <ul className="divide-y divide-border/60">
                {section.lessons.map((lesson) => {
                  const preview = lesson.isPreview ? previews.get(lesson.id) : undefined;
                  const Icon = lesson.type === "VIDEO" ? PlayCircle : FileText;
                  return (
                    <li key={lesson.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="flex-1">{lesson.title}</span>
                      {preview && <LessonPreviewDialog title={lesson.title} preview={preview} />}
                      {lesson.durationSec ? (
                        <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
                          {formatLessonDuration(lesson.durationSec)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
