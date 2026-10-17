"use client";

import { useActionState, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { updateCourseGoalsAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/actions";
import { useActionSuccess } from "@/hooks/use-action-success";
import { PUBLISH_RULES } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};
const MAX_ITEMS = 20;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save intended learners"}
    </Button>
  );
}

/**
 * One text input per item, submitted as repeated `name` fields. Starts with at least `minRows`
 * empty rows so the checklist minimum is visible; blank rows are dropped on save.
 */
function ListEditor({
  name,
  label,
  description,
  initial,
  minRows,
  placeholders,
}: {
  name: string;
  label: string;
  description: string;
  initial: string[];
  minRows: number;
  placeholders: string[];
}) {
  const baseId = useId();
  // Inputs are uncontrolled; the stable key is what keeps each typed value with its row on remove.
  const [rows, setRows] = useState(() => {
    const values = [...initial];
    while (values.length < minRows) values.push("");
    return values.map((value, key) => ({ key, value }));
  });
  const listRef = useRef<HTMLUListElement>(null);

  function add() {
    setRows((r) => [...r, { key: Math.max(-1, ...r.map((x) => x.key)) + 1, value: "" }]);
    // Focus the new row once it renders.
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus());
  }

  return (
    <fieldset className="space-y-3">
      <legend className="space-y-1">
        <span className="font-heading text-base font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </legend>
      <ul ref={listRef} className="space-y-2">
        {rows.map((item, index) => (
          <li key={item.key} className="flex items-center gap-2">
            <Label htmlFor={`${baseId}-${item.key}`} className="sr-only">
              {label} {index + 1}
            </Label>
            <Input
              id={`${baseId}-${item.key}`}
              name={name}
              defaultValue={item.value}
              maxLength={200}
              placeholder={placeholders[index % placeholders.length]}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              onClick={() => setRows((r) => r.filter((x) => x.key !== item.key))}
              disabled={rows.length === 1}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_ITEMS}>
        <Plus aria-hidden />
        Add another
      </Button>
    </fieldset>
  );
}

export function GoalsForm({
  courseId,
  outcomes,
  requirements,
  targetAudience,
}: {
  courseId: string;
  outcomes: string[];
  requirements: string[];
  targetAudience: string | null;
}) {
  const [state, formAction] = useActionState(updateCourseGoalsAction.bind(null, courseId), initialState);
  useActionSuccess(state, initialState, () => toast.success("Intended learners saved"));

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      <ListEditor
        name="outcomes"
        label="What will students learn?"
        description={`At least ${PUBLISH_RULES.minOutcomes}. Start each with a verb - these become "What you'll learn" on the course page.`}
        initial={outcomes}
        minRows={PUBLISH_RULES.minOutcomes}
        placeholders={[
          "Build a full-stack app with React and Next.js",
          "Model data and query it with Prisma",
          "Deploy to production with a custom domain",
        ]}
      />
      <ListEditor
        name="requirements"
        label="What do students need before they start?"
        description="Tools, accounts or knowledge. If there's nothing, say so - beginners like to know."
        initial={requirements}
        minRows={1}
        placeholders={["Basic JavaScript - variables, functions and arrays", "A computer with Node.js installed"]}
      />
      <div className="space-y-2">
        <Label htmlFor="targetAudience" className="font-heading text-base font-semibold">
          Who is this course for?
        </Label>
        <Textarea
          id="targetAudience"
          name="targetAudience"
          defaultValue={targetAudience ?? ""}
          rows={4}
          maxLength={1000}
          placeholder="Front-end developers who want to start building their own back ends."
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SaveButton />
    </form>
  );
}
