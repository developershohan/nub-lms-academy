"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest is a safe, non-sensitive Next.js error-instance id - the message/stack itself is
    // never rendered to the user or logged from the client.
    console.error("Unexpected error boundary triggered", { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">Error</p>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. Try again, or come back later if the problem continues.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
