"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hideMessageAction } from "@/components/chat/actions";

type ModerationMessage = {
  id: string;
  content: string;
  createdAt: string;
  reportedAt: string | null;
  sender: { name: string | null; email: string };
  conversation: { type: "DIRECT" | "COURSE_GROUP" | "SUPPORT"; course: { title: string } | null };
};

export function MessageModerationFeed({ initialMessages }: { initialMessages: ModerationMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);

  async function handleHide(id: string) {
    const result = await hideMessageAction(id);
    if ("error" in result) return toast.error(result.error);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    toast.success("Message hidden");
  }

  if (messages.length === 0) return <p className="text-muted-foreground">No recent messages.</p>;

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <Card key={m.id}>
          <CardContent className="flex items-start justify-between gap-4 pt-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{m.sender.name ?? m.sender.email}</span>
                <Badge variant="outline">{m.conversation.course?.title ?? m.conversation.type}</Badge>
                {m.reportedAt && <Badge variant="destructive">Reported</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{m.content}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => handleHide(m.id)}>
              Hide
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
