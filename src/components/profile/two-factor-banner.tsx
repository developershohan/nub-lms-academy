"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";

const DISMISS_KEY = "2fa-nudge-dismissed";

/** A recommendation only - no two-factor auth is implemented yet, this just plants the UI nudge.
 * "Per season" (the product ask) is read as "per browser session" - sessionStorage clears when
 * the tab/browser session ends, so the nudge reappears next time rather than being gone forever. */
export function TwoFactorBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Deferred one tick: setState must not be called synchronously from inside an effect body.
    queueMicrotask(() => setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"));
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
      <div className="flex gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          Add two-factor authentication for stronger account security.{" "}
          <span className="text-muted-foreground">(Coming soon.)</span>
        </span>
      </div>
      <button
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
