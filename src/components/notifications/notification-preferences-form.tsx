"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateNotificationPreferencesAction, type PreferencesState } from "@/components/notifications/actions";
import { useActionSuccess } from "@/hooks/use-action-success";
import { Button } from "@/components/ui/button";
import type { NotificationCategory } from "@/lib/notification-categories";

type Preference = {
  category: NotificationCategory;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  emailAvailable: boolean;
  inAppLocked: boolean;
};

const initialState: PreferencesState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save preferences"}
    </Button>
  );
}

/** A category per row with an in-app and an email switch. Locked or unavailable ones say why. */
export function NotificationPreferencesForm({ preferences }: { preferences: Preference[] }) {
  const [state, formAction] = useActionState(updateNotificationPreferencesAction, initialState);
  useActionSuccess(state, initialState, () => toast.success("Preferences saved"));

  return (
    <form action={formAction} className="space-y-5">
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span className="text-center">In app</span>
          <span className="text-center">Email</span>
        </div>
        <ul className="divide-y">
          {preferences.map((p) => (
            <li key={p.category} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-3 px-4 py-3.5">
              <input type="hidden" name="category" value={p.category} />
              <div className="min-w-0">
                <p id={`pref-${p.category}`} className="text-sm font-medium">
                  {p.label}
                </p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
                {!p.emailAvailable && <p className="mt-0.5 text-xs text-muted-foreground">No email for this yet.</p>}
              </div>
              <label className="flex justify-center">
                <span className="sr-only">Show {p.label} in the app</span>
                <input
                  type="checkbox"
                  name={`inApp:${p.category}`}
                  defaultChecked={p.inApp}
                  disabled={p.inAppLocked}
                  className="size-4 accent-primary disabled:opacity-60"
                />
              </label>
              <label className="flex justify-center">
                <span className="sr-only">Email me about {p.label}</span>
                <input
                  type="checkbox"
                  name={`email:${p.category}`}
                  defaultChecked={p.email}
                  disabled={!p.emailAvailable}
                  className="size-4 accent-primary disabled:opacity-40"
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SaveButton />
    </form>
  );
}
