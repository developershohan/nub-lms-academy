"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApplyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function apply() {
    setLoading(true);
    const res = await fetch("/api/v1/users/apply-teacher", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Could not submit application");
      return;
    }
    toast.success("Application submitted");
    router.refresh();
  }

  return (
    <Button onClick={apply} disabled={loading}>
      {loading ? "Submitting..." : "Apply to become a teacher"}
    </Button>
  );
}
