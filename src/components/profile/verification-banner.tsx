"use client";

import { useState } from "react";
import { toast } from "sonner";
import { resendOwnVerificationAction } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";

export function VerificationBanner() {
  const [sent, setSent] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
      <span>Your email isn&apos;t verified yet.</span>
      <Button
        size="sm"
        variant="outline"
        disabled={sent}
        onClick={async () => {
          setSent(true);
          await resendOwnVerificationAction();
          toast.success("Verification email sent - check your inbox.");
        }}
      >
        {sent ? "Sent" : "Resend verification email"}
      </Button>
    </div>
  );
}
