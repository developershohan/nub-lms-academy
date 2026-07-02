"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionSuccess } from "@/hooks/use-action-success";
import {
  createSectionAction,
  updateSectionAction,
  deleteSectionAction,
  createLessonAction,
  updateLessonAction,
  deleteLessonAction,
  type ActionState,
} from "@/app/teacher/(dashboard)/courses/[courseId]/edit/actions";

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

function LessonFields({ lesson }: { lesson?: Lesson }) {
  const [type, setType] = useState<"VIDEO" | "TEXT">(lesson?.type ?? "TEXT");
  return (
    <>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input name="title" defaultValue={lesson?.title} required />
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
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">Text</SelectItem>
              <SelectItem value="VIDEO">Video</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Duration (seconds)</Label>
          <Input name="durationSec" type="number" min={0} defaultValue={lesson?.durationSec ?? ""} />
        </div>
      </div>
      {type === "TEXT" ? (
        <div className="space-y-1.5">
          <Label>Content</Label>
          <Textarea name="content" defaultValue={lesson?.content ?? ""} rows={3} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Video URL</Label>
          <Input name="videoUrl" type="url" defaultValue={lesson?.videoAsset?.playbackUrl ?? ""} placeholder="https://youtube.com/watch?v=..." />
          <p className="text-xs text-muted-foreground">YouTube, Vimeo, or a direct video file URL.</p>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isPreview" defaultChecked={lesson?.isPreview} />
        Free preview lesson
      </label>
    </>
  );
}

function LessonRow({ lesson }: { lesson: Lesson }) {
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
      <form action={updateAction} className="space-y-3 rounded-md border p-3">
        <input type="hidden" name="lessonId" value={lesson.id} />
        <LessonFields lesson={lesson} />
        {updateState.error && <p className="text-sm text-destructive">{updateState.error}</p>}
        <div className="flex gap-2">
          <SubmitButton label="Save" pendingLabel="Saving..." />
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span>{lesson.title}</span>
        <Badge variant="secondary">{lesson.type}</Badge>
        {lesson.isPreview && <Badge variant="outline">Preview</Badge>}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <form action={deleteAction}>
          <input type="hidden" name="lessonId" value={lesson.id} />
          <Button type="submit" size="sm" variant="ghost">
            Delete
          </Button>
        </form>
      </div>
      {deleteState.error && <p className="text-sm text-destructive">{deleteState.error}</p>}
    </div>
  );
}

function AddLessonForm({ sectionId }: { sectionId: string }) {
  const [state, formAction] = useActionState(createLessonAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);

  useActionSuccess(state, initialState, () => {
    toast.success("Lesson added");
    formRef.current?.reset();
    setResetKey((k) => k + 1); // remounts LessonFields so its Type selection also resets to Text
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md border border-dashed p-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <LessonFields key={resetKey} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton label="Add lesson" pendingLabel="Adding..." />
    </form>
  );
}

function SectionCard({ section }: { section: Section }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [renameState, renameAction] = useActionState(updateSectionAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteSectionAction, initialState);

  useActionSuccess(renameState, initialState, () => {
    toast.success("Section renamed");
    setEditingTitle(false);
  });
  useActionSuccess(deleteState, initialState, () => toast.success("Section deleted"));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        {editingTitle ? (
          <form action={renameAction} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="sectionId" value={section.id} />
            <Input name="title" defaultValue={section.title} required />
            <SubmitButton label="Save" pendingLabel="Saving..." />
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingTitle(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingTitle(true)}>
                Rename
              </Button>
              <form action={deleteAction}>
                <input type="hidden" name="sectionId" value={section.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Delete section
                </Button>
              </form>
            </div>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {renameState.error && <p className="text-sm text-destructive">{renameState.error}</p>}
        {deleteState.error && <p className="text-sm text-destructive">{deleteState.error}</p>}
        {section.lessons.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} />
        ))}
        <AddLessonForm sectionId={section.id} />
      </CardContent>
    </Card>
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
    <form ref={formRef} action={formAction} className="flex items-start gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex-1 space-y-1.5">
        <Input name="title" placeholder="New section title" required />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <SubmitButton label="Add section" pendingLabel="Adding..." />
    </form>
  );
}

export function CurriculumBuilder({ courseId, sections }: { courseId: string; sections: Section[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}
      <AddSectionForm courseId={courseId} />
    </div>
  );
}
