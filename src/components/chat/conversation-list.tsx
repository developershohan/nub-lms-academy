"use client";

import { BookOpen, LifeBuoy, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function Avatar({ conversation }: { conversation: ConversationSummary }) {
  const base = "flex size-10 shrink-0 items-center justify-center rounded-full";
  if (conversation.type === "COURSE_GROUP") {
    return (
      <span className={cn(base, "bg-primary/10 text-primary")} aria-hidden>
        <BookOpen className="size-5" />
      </span>
    );
  }
  if (conversation.type === "SUPPORT") {
    return (
      <span className={cn(base, "bg-amber/25 text-amber-foreground dark:text-amber")} aria-hidden>
        <LifeBuoy className="size-5" />
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-muted font-heading text-sm font-semibold")} aria-hidden>
      {initials(conversation.label)}
    </span>
  );
}

/** The inbox: newest activity first, unread counts, and a filter by name. */
export function ConversationList({
  conversations,
  selectedId,
  query,
  onQueryChange,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const shown = needle ? conversations.filter((c) => c.label.toLowerCase().includes(needle)) : conversations;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          className="pl-8"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" aria-label="Conversations">
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {needle ? "No conversations match." : "No conversations yet."}
          </li>
        )}
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={c.id === selectedId ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                c.id === selectedId ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <Avatar conversation={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}>{c.label}</span>
                  {c.lastMessageAt && (
                    <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
                      {formatRelativeTime(new Date(c.lastMessageAt))}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-xs", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {c.lastMessage ?? (c.type === "COURSE_GROUP" ? "Course group chat" : "No messages yet")}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                      {c.unread > 99 ? "99+" : c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
