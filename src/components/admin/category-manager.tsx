"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createCategoryAction, deleteCategoryAction, type ActionState } from "@/app/admin/categories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  const [state, formAction] = useActionState(deleteCategoryAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <SubmitButton label="Delete" pendingLabel="Deleting..." />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function CreateCategoryForm() {
  const [state, formAction] = useActionState(createCategoryAction, initialState);
  return (
    <form action={formAction} className="flex items-start gap-2">
      <div className="flex-1 space-y-1.5">
        <Input name="name" placeholder="New category name" required />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <SubmitButton label="Add category" pendingLabel="Adding..." />
    </form>
  );
}
