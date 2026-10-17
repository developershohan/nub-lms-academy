"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Check, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/components/chat/use-chat-thread";

const MAX_LENGTH = 2000;

function dayLabel(iso: string, today: string, yesterday: string) {
  const day = iso.slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function MessageThread({
  title,
  subtitle,
  currentUserId,
  isDirect,
  isModerator,
  connectionNote,
  thread,
  onBack,
  onHide,
  onTyping,
}: {
  title: string;
  subtitle: React.ReactNode;
  currentUserId: string;
  isDirect: boolean;
  isModerator: boolean;
  connectionNote: string | null;
  thread: {
    messages: ChatMessage[];
    loading: boolean;
    hasEarlier: boolean;
    loadingEarlier: boolean;
    loadEarlier: () => Promise<void>;
    typing: string | null;
    othersReadSeq: number;
    send: (text: string) => void;
    retry: (message: ChatMessage) => void;
  };
  onBack: () => void;
  onHide: (messageId: string) => void;
  onTyping: (typing: boolean) => void;
}) {
  const { messages } = thread;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const lastCount = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevFirstId = useRef<string | null>(null);
  const prevHeight = useRef(0);

  const [today, yesterday] = (() => {
    const now = new Date();
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [now.toISOString().slice(0, 10), y.toISOString().slice(0, 10)];
  })();

  // Keep the view pinned: stick to the bottom for new messages, keep position when older ones load.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const firstId = messages[0]?.id ?? null;
    if (prevFirstId.current && firstId !== prevFirstId.current && messages.length > lastCount.current) {
      // Earlier messages were prepended: hold the reader where they were.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (atBottom.current || messages.at(-1)?.senderId === currentUserId) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > lastCount.current) {
      queueMicrotask(() => setUnseenBelow((n) => n + messages.length - lastCount.current));
    }
    prevFirstId.current = firstId;
    prevHeight.current = el.scrollHeight;
    lastCount.current = messages.length;
  }, [messages, currentUserId]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseenBelow(0);
  }

  function jumpToLatest() {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseenBelow(0);
  }

  function submit() {
    if (!draft.trim()) return;
    thread.send(draft);
    setDraft("");
    clearTimeout(typingTimer.current);
    onTyping(false);
  }

  function changeDraft(value: string) {
    setDraft(value);
    onTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping(false), 2000);
  }

  const lastOwnSaved = [...messages].reverse().find((m) => m.senderId === currentUserId && !m.pending && !m.failed);

  return (
    <section aria-label={`Conversation: ${title}`} className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-base font-semibold">{title}</h2>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        {connectionNote && <span className="shrink-0 text-xs text-amber-foreground dark:text-amber">{connectionNote}</span>}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4" aria-live="polite" aria-relevant="additions">
          {thread.loading && <p className="text-center text-sm text-muted-foreground">Loading messages…</p>}
          {!thread.loading && thread.hasEarlier && (
            <div className="mb-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => void thread.loadEarlier()} disabled={thread.loadingEarlier}>
                {thread.loadingEarlier ? "Loading…" : "Load earlier messages"}
              </Button>
            </div>
          )}
          {!thread.loading && messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
          )}
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.senderId === currentUserId;
              const newDay = !prev || prev.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
              const firstOfRun = newDay || prev.senderId !== m.senderId;
              const seen = isDirect && mine && m.id === lastOwnSaved?.id && thread.othersReadSeq >= m.seq;
              return (
                <li key={m.id}>
                  {newDay && (
                    <p className="my-3 text-center font-mono text-[11px] tracking-widest text-muted-foreground uppercase" suppressHydrationWarning>
                      {dayLabel(m.createdAt, today, yesterday)}
                    </p>
                  )}
                  <div className={cn("flex flex-col", mine ? "items-end" : "items-start", firstOfRun && "mt-2")}>
                    {firstOfRun && !mine && (
                      <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">{m.sender.name ?? "User"}</span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                        mine ? "bg-primary text-primary-foreground" : "bg-muted",
                        m.pending && "opacity-70",
                        m.failed && "bg-destructive/10 text-foreground ring-1 ring-destructive/40"
                      )}
                    >
                      {m.deletedAt ? <em className="opacity-70">Message removed</em> : m.content}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                      {m.failed ? (
                        <button type="button" onClick={() => thread.retry(m)} className="inline-flex items-center gap-1 text-destructive underline">
                          <RotateCcw className="size-3" aria-hidden />
                          Not sent - retry
                        </button>
                      ) : m.pending ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          Sending
                        </span>
                      ) : (
                        <span suppressHydrationWarning>{timeOf(m.createdAt)}</span>
                      )}
                      {seen && (
                        <span className="inline-flex items-center gap-0.5">
                          <Check className="size-3" aria-hidden />
                          Seen
                        </span>
                      )}
                      {isModerator && !m.deletedAt && !m.pending && !m.failed && (
                        <button type="button" onClick={() => onHide(m.id)} className="underline">
                          Hide
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {unseenBelow > 0 && (
          <Button size="sm" className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md" onClick={jumpToLatest}>
            <ArrowDown aria-hidden />
            {unseenBelow} new {unseenBelow === 1 ? "message" : "messages"}
          </Button>
        )}
      </div>

      <div className="min-h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
        {thread.typing ? `${thread.typing} is typing…` : ""}
      </div>
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-draft" className="sr-only">
          Message
        </label>
        <Textarea
          id="chat-draft"
          value={draft}
          onChange={(e) => changeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message… (Shift+Enter for a new line)"
          rows={1}
          maxLength={MAX_LENGTH}
          className="max-h-40 min-h-9 resize-none [field-sizing:content]"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Send
        </Button>
      </form>
      {draft.length > MAX_LENGTH - 200 && (
        <p className="px-4 pb-2 text-right text-xs text-muted-foreground">
          {draft.length} / {MAX_LENGTH}
        </p>
      )}
    </section>
  );
}
