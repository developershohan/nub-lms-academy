"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateCourseDetailsAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/edit/actions";
import { courseLevels } from "@/lib/validations/course";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initialState: ActionState = {};

type Course = {
  title: string;
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  level: (typeof courseLevels)[number];
  language: string;
  price: number;
  salePrice: number | null;
  targetAudience: string | null;
  requirements: { content: string }[];
  outcomes: { content: string }[];
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save details"}
    </Button>
  );
}

export function CourseDetailsForm({
  courseId,
  course,
  categories,
}: {
  courseId: string;
  course: Course;
  categories: { id: string; name: string }[];
}) {
  const action = updateCourseDetailsAction.bind(null, courseId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Title</Label>
          <Input name="title" defaultValue={course.title} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Subtitle</Label>
          <Input name="subtitle" defaultValue={course.subtitle ?? ""} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Description</Label>
          <Textarea name="description" defaultValue={course.description ?? ""} rows={4} />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select name="categoryId" defaultValue={course.categoryId ?? undefined}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Uncategorized" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Level</Label>
          <Select name="level" defaultValue={course.level}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courseLevels.map((level) => (
                <SelectItem key={level} value={level}>
                  {level.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Input name="language" defaultValue={course.language} required />
        </div>
        <div className="space-y-1.5">
          <Label>Price (USD)</Label>
          <Input name="price" type="number" min={0} step="0.01" defaultValue={course.price} required />
        </div>
        <div className="space-y-1.5">
          <Label>Sale price (optional)</Label>
          <Input
            name="salePrice"
            type="number"
            min={0}
            step="0.01"
            defaultValue={course.salePrice ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Target audience</Label>
          <Textarea name="targetAudience" defaultValue={course.targetAudience ?? ""} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label>Requirements (one per line)</Label>
          <Textarea
            name="requirements"
            defaultValue={course.requirements.map((r) => r.content).join("\n")}
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Learning outcomes (one per line)</Label>
          <Textarea name="outcomes" defaultValue={course.outcomes.map((o) => o.content).join("\n")} rows={4} />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-muted-foreground">Saved.</p>}
      <SubmitButton />
    </form>
  );
}
