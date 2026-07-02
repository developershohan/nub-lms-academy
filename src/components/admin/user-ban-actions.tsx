"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { banUserAction, unbanUserAction, type ActionState } from "@/app/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};

function ActionButton({ label, pendingLabel, variant }: { label: string; pendingLabel: string; variant?: "outline" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function UserBanActions({ userId, banned }: { userId: string; banned: boolean }) {
  const [banState, banAction] = useActionState(banUserAction, initialState);
  const [unbanState, unbanAction] = useActionState(unbanUserAction, initialState);
  const [showBanForm, setShowBanForm] = useState(false);

  if (banned) {
    return (
      <form action={unbanAction} className="flex flex-col items-end gap-1">
        <input type="hidden" name="userId" value={userId} />
        <ActionButton label="Unban" pendingLabel="Unbanning..." variant="outline" />
        {unbanState.error && <p className="text-sm text-destructive">{unbanState.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!showBanForm ? (
        <Button size="sm" variant="destructive" onClick={() => setShowBanForm(true)}>
          Ban
        </Button>
      ) : (
        <form action={banAction} className="flex w-64 flex-col items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <Textarea name="reason" placeholder="Reason for ban" required rows={2} />
          <ActionButton label="Confirm ban" pendingLabel="Banning..." variant="destructive" />
        </form>
      )}
      {banState.error && <p className="text-sm text-destructive">{banState.error}</p>}
    </div>
  );
}
