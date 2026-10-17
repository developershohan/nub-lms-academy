"use client";

import { useEffect, useRef, useState } from "react";
import { CloudCheck, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { saveLessonNoteAction } from "@/app/student/course/[courseId]/learn/actions";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeDate } from "@/lib/format";
import { LESSON_NOTE_MAX_LENGTH } from "@/lib/validations/learning";

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1000;

/**
 * The student's private notepad for one lesson. Saves itself a second after typing stops, on
 * blur, and when the student moves to another lesson; warns before closing the tab with unsaved
 * edits. Render with key={lessonId} so each lesson gets a fresh editor.
 */
export function LessonNotes({
  lessonId,
  initialContent,
  initialUpdatedAt,
}: {
  lessonId: string;
  initialContent: string;
  initialUpdatedAt: string | null;
}) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(initialUpdatedAt);

  const latest = useRef(initialContent);
  const saved = useRef(initialContent);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function flush() {
    clearTimeout(timer.current);
    if (saving.current) return; // the save in flight picks up the latest text when it finishes
    saving.current = true;
    try {
      while (latest.current !== saved.current) {
        const text = latest.current;
        setStatus("saving");
        const result = await saveLessonNoteAction({ lessonId, content: text });
        if ("error" in result) {
          setStatus("error");
          setError(result.error);
          return;
        }
        saved.current = text;
        setSavedAt(result.savedAt);
      }
      setStatus((current) => (current === "idle" ? "idle" : "saved"));
      setError(null);
    } catch {
      setStatus("error");
      setError("Couldn't save your notes. Check your connection - we'll try again when you keep typing.");
    } finally {
      saving.current = false;
    }
  }

  function handleChange(value: string) {
    setContent(value);
    latest.current = value;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  }

  // Leaving the lesson (or the page) with edits still pending.
  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    const pending = timer;
    return () => {
      window.removeEventListener("beforeunload", warnIfUnsaved);
      clearTimeout(pending.current);
      if (latest.current !== saved.current && !saving.current) {
        void saveLessonNoteAction({ lessonId, content: latest.current }).catch(() => {});
      }
    };
  }, [lessonId]);

  const remaining = LESSON_NOTE_MAX_LENGTH - content.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden />
          Only you can see your notes.
        </p>
        <SaveIndicator status={status} savedAt={savedAt} />
      </div>
      <Textarea
        value={content}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => void flush()}
        maxLength={LESSON_NOTE_MAX_LENGTH}
        placeholder="Jot down key ideas, questions to ask, code to try later..."
        aria-label="Your notes for this lesson"
        className="min-h-56 resize-y bg-card px-4 py-3 text-[0.95rem] leading-relaxed md:text-[0.95rem] dark:bg-input/20"
      />
      {status === "error" && error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {remaining < 1000 && (
        <p className="text-right font-mono text-xs text-muted-foreground">{remaining} characters left</p>
      )}
    </div>
  );
}

function SaveIndicator({ status, savedAt }: { status: SaveStatus; savedAt: string | null }) {
  if (status === "saving") {
    return (
      <p className="flex items-center gap-1.5" aria-live="polite">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Saving...
      </p>
    );
  }
  if (status === "unsaved") return <p aria-live="polite">Unsaved changes</p>;
  if (status === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-primary" aria-live="polite">
        <CloudCheck className="size-3.5" aria-hidden />
        Saved
      </p>
    );
  }
  if (status === "idle" && savedAt) return <p>Last edited {formatRelativeDate(new Date(savedAt))}</p>;
  return <p aria-live="polite" />;
}
