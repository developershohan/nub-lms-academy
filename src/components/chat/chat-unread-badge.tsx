"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { useUnreadTotal } from "@/components/chat/unread-store";
import { Button } from "@/components/ui/button";

/** Header shortcut to the inbox with the live unread-messages total (muted chats excluded). */
export function ChatUnreadBadge({ href }: { href: string }) {
  const { socket } = useSocket();
  const total = useUnreadTotal(socket);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      render={<Link href={href} />}
      aria-label={total > 0 ? `Messages, ${total} unread` : "Messages"}
    >
      <MessagesSquare className="size-4" />
      {total > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </Button>
  );
}
