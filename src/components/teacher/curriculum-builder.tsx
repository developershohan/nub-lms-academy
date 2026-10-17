"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, ChevronUp, FileText, ListTree, PlayCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useActionSuccess } from "@/hooks/use-action-success";
import { formatLessonDuration, formatTotalDuration } from "@/lib/format";
import {
  createSectionAction,
  updateSectionAction,
  deleteSectionAction,
  createLessonAction,
  updateLessonAction,
  deleteLessonAction,
  moveSectionAction,
  moveLessonAction,
  type ActionState,
} from "@/app/teacher/(dashboard)/courses/[courseId]/actions";

type Lesson = {
  id: string;
  title: string;
  type: "VIDEO" | "TEXT";
  content: string | null;
  durationSec: number | null;
  isPreview: boolean;
  videoAsset: { playbackUrl: string } | null;
};

type Section = { id: string; title: string; lessons: Lesson[] };

const initialState: ActionState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Asks before a destructive form submits - the form's action never runs if the teacher cancels. */
function confirmSubmit(message: string) {
  return (event: React.FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

function MoveButtons({
  action,
  id,
  label,
  isFirst,
  isLast,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <form action={action} className="flex">
      <input type="hidden" name="id" value={id} />
      <MoveButton direction="up" label={`Move ${label} up`} disabled={isFirst} />
      <MoveButton direction="down" label={`Move ${label} down`} disabled={isLast} />
    </form>
  );
}

function MoveButton({ direction, label, disabled }: { direction: "up" | "down"; label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Button
      type="submit"
      name="direction"
      value={direction}
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled || pending}
    >
      <Icon aria-hidden />
    </Button>
  );
}

function LessonFields({ lesson }: { lesson?: Lesson }) {
  const [type, setType] = useState<"VIDEO" | "TEXT">(lesson?.type ?? "TEXT");
  const id = (field: string) => `${field}-${lesson?.id ?? "new"}`;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={id("title")}>Title</Label>
        <Input id={id("title")} name="title" defaultValue={lesson?.title} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            name="type"
            value={type}
            onValueChange={(v) => setType(v as "VIDEO" | "TEXT")}
            items={{ TEXT: "Text", VIDEO: "Video" }}
          >
            <SelectTrigger className="w-full" aria-label="Lesson type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">Text</SelectItem>
              <SelectItem value="VIDEO">Video</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("duration")}>Length</Label>
          <Input
            id={id("duration")}
            name="duration"
            placeholder="mm:ss"
            defaultValue={lesson?.durationSec ? formatLessonDuration(lesson.durationSec) : ""}
          />
        </div>
      </div>
      {type === "TEXT" ? (
        <div className="space-y-1.5">
          <Label htmlFor={id("content")}>Content</Label>
          <Textarea id={id("content")} name="content" defaultValue={lesson?.content ?? ""} rows={5} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={id("video")}>Video URL</Label>
          <Input
            id={id("video")}
            name="videoUrl"
            type="url"
            defaultValue={lesson?.videoAsset?.playbackUrl ?? ""}
            placeholder="https://youtube.com/watch?v=..."
          />
          <p className="text-xs text-muted-foreground">YouTube, Vimeo, or a direct video file URL.</p>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPreview" defaultChecked={lesson?.isPreview} className="size-4 accent-primary" />
        Free preview: anyone can watch this lesson before enrolling
      </label>
    </>
  );
}

function LessonRow({
  lesson,
  number,
  isFirst,
  isLast,
}: {
  lesson: Lesson;
  number: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateLessonAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteLessonAction, initialState);

  useActionSuccess(updateState, initialState, () => {
    toast.success("Lesson updated");
    setEditing(false);
  });
  useActionSuccess(deleteState, initialState, () => toast.success("Lesson deleted"));

  if (editing) {
    return (
      <li>
        <form action={updateAction} className="space-y-3 rounded-lg border bg-background p-3">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <LessonFields lesson={lesson} />
          {updateState.error && <p className="text-sm text-destructive">{updateState.error}</p>}
          <div className="flex gap-2">
            <SubmitButton label="Save lesson" pendingLabel="Saving..." />
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  const Icon = lesson.type === "VIDEO" ? PlayCircle : FileText;
  return (
    <li className="rounded-lg border bg-background">
      {/* On phones the controls wrap under the title instead of squeezing it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
          <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{number}</span>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={lesson.type === "VIDEO" ? "Video" : "Text"} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.title}</span>
          {lesson.isPreview && <Badge variant="outline">Preview</Badge>}
          <span className="font-mono text-xs text-muted-foreground">
            {lesson.durationSec ? formatLessonDuration(lesson.durationSec) : <span aria-label="No length set">–:––</span>}
          </span>
        </div>
        <div className="-mr-1 ml-auto flex items-center">
          <MoveButtons action={moveLessonAction} id={lesson.id} label={`lesson ${number}`} isFirst={isFirst} isLast={isLast} />
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <form
            action={deleteAction}
            onSubmit={confirmSubmit(`Delete the lesson "${lesson.title}"? Students lose their progress on it.`)}
          >
            <input type="hidden" name="lessonId" value={lesson.id} />
            <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </form>
        </div>
      </div>
      {deleteState.error && <p className="px-3 pb-2 text-sm text-destructive">{deleteState.error}</p>}
    </li>
  );
}

function AddLessonForm({ sectionId }: { sectionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createLessonAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);

  // Stays open after adding, so a teacher can enter a run of lessons in one go.
  useActionSuccess(state, initialState, () => {
    toast.success("Lesson added");
    formRef.current?.reset();
    setResetKey((k) => k + 1); // remounts LessonFields so its Type selection also resets to Text
  });

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add lesson
      </Button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-dashed bg-background p-3">
      <p className="text-sm font-medium">New lesson</p>
      <input type="hidden" name="sectionId" value={sectionId} />
      <LessonFields key={resetKey} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton label="Add lesson" pendingLabel="Adding..." />
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}

function SectionCard({
  section,
  index,
  firstLessonNumber,
  isFirst,
  isLast,
}: {
  section: Section;
  index: number;
  firstLessonNumber: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [renameState, renameAction] = useActionState(updateSectionAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteSectionAction, initialState);
  const length = section.lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
  const lessonWord = section.lessons.length === 1 ? "lesson" : "lessons";

  useActionSuccess(renameState, initialState, () => {
    toast.success("Section renamed");
    setEditingTitle(false);
  });
  useActionSuccess(deleteState, initialState, () => toast.success("Section deleted"));

  return (
    <section aria-label={`Section ${index + 1}: ${section.title}`} className="rounded-xl border bg-muted/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editingTitle ? (
          <form action={renameAction} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="sectionId" value={section.id} />
            <Input name="title" defaultValue={section.title} required aria-label="Section title" className="min-w-48 flex-1" />
            <SubmitButton label="Save" pendingLabel="Saving..." />
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingTitle(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0 space-y-0.5">
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Section {index + 1}</p>
              <h3 className="font-heading text-base font-semibold break-words">{section.title}</h3>
              <p className="text-xs text-muted-foreground">
                {section.lessons.length} {lessonWord}
                {length > 0 && ` · ${formatTotalDuration(length)}`}
              </p>
            </div>
            <div className="flex items-center">
              <MoveButtons
                action={moveSectionAction}
                id={section.id}
                label={`section ${index + 1}`}
                isFirst={isFirst}
                isLast={isLast}
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingTitle(true)}>
                Rename
              </Button>
              <form
                action={deleteAction}
                onSubmit={confirmSubmit(`Delete the section "${section.title}" and its ${section.lessons.length} ${lessonWord}?`)}
              >
                <input type="hidden" name="sectionId" value={section.id} />
                <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                  Delete
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
      {renameState.error && <p className="mt-2 text-sm text-destructive">{renameState.error}</p>}
      {deleteState.error && <p className="mt-2 text-sm text-destructive">{deleteState.error}</p>}

      {section.lessons.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {section.lessons.map((lesson, i) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              number={firstLessonNumber + i}
              isFirst={i === 0}
              isLast={i === section.lessons.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed bg-background px-3 py-4 text-center text-sm text-muted-foreground">
          No lessons yet. Every section needs at least one.
        </p>
      )}
      <div className="mt-3">
        <AddLessonForm sectionId={section.id} />
      </div>
    </section>
  );
}

function AddSectionForm({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(createSectionAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useActionSuccess(state, initialState, () => {
    toast.success("Section added");
    formRef.current?.reset();
  });

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="min-w-48 flex-1 space-y-1.5">
        <Input name="title" placeholder="New section title, e.g. Getting started" required aria-label="New section title" />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <SubmitButton label="Add section" pendingLabel="Adding..." />
    </form>
  );
}

export function CurriculumBuilder({ courseId, sections }: { courseId: string; sections: Section[] }) {
  // Lessons are numbered through the whole course, the way students see them.
  const firstNumbers: number[] = [];
  sections.forEach((section, i) => {
    firstNumbers.push(i === 0 ? 1 : firstNumbers[i - 1] + sections[i - 1].lessons.length);
  });

  return (
    <div className="space-y-4">
      {sections.length === 0 && (
        <EmptyState
          icon={ListTree}
          title="Plan your first section"
          description="Group lessons into sections - a module, a week, or a project milestone. Add one below to get started."
        />
      )}
      {sections.map((section, i) => (
        <SectionCard
          key={section.id}
          section={section}
          index={i}
          firstLessonNumber={firstNumbers[i]}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
        />
      ))}
      <AddSectionForm courseId={courseId} />
    </div>
  );
}
