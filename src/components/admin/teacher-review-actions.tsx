"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function TeacherReviewActions({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function review(action: "approve" | "reject") {
    setLoading(action);
    const res = await fetch(`/api/v1/admin/teachers/${teacherId}/${action}`, { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      toast.error("Action failed");
      return;
    }
    toast.success(action === "approve" ? "Teacher approved" : "Application rejected");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => review("approve")} disabled={loading !== null}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => review("reject")} disabled={loading !== null}>
        Reject
      </Button>
    </div>
  );
}
