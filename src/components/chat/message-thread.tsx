"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Copy,
  CornerUpLeft,
  Flag,
  Info,
  MoreHorizontal,
  Pencil,
  Pin,
  RotateCcw,
  ShieldX,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatReplyRef } from "@/components/chat/use-chat-thread";

const MAX_LENGTH = 2000;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "✅"] as const;
/** Virtuoso needs a stable, large first index so older messages can be prepended above it. */
const START_INDEX = 1_000_000;
/** Messages from the same person within this gap are drawn as one run (one name). */
const RUN_GAP_MS = 5 * 60_000;

function dayLabel(iso: string, today: string, yesterday: string) {
  const day = iso.slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export type ThreadActions = {
  onReply(ref: ChatReplyRef): void;
  onEdit(message: ChatMessage): void;
  onDelete(message: ChatMessage): void;
  onRemove(message: ChatMessage): void;
  onReact(messageId: string, emoji: string): void;
  onReport(message: ChatMessage): void;
  onPin(message: ChatMessage): void;
  onRetry(message: ChatMessage): void;
  onDiscard(message: ChatMessage): void;
  onJumpTo(seq: number): void;
};

type RowProps = {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  currentUserId: string;
  isGroup: boolean;
  canPost: boolean;
  canModerate: boolean;
  seen: boolean;
  pinned: boolean;
  today: string;
  yesterday: string;
  actions: ThreadActions;
};

const MessageRow = memo(function MessageRow({ message: m, previous, currentUserId, isGroup, canPost, canModerate, seen, pinned, today, yesterday, actions }: RowProps) {
  const newDay = !previous || previous.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
  const separator = newDay && (
    <p className="my-3 text-center font-mono text-[11px] tracking-widest text-muted-foreground uppercase" suppressHydrationWarning>
      {dayLabel(m.createdAt, today, yesterday)}
    </p>
  );
  if (m.type === "SYSTEM") {
    return (
      <div>
        {separator}
        <p className="px-6 py-1.5 text-center text-xs text-muted-foreground">{m.content}</p>
      </div>
    );
  }
  const mine = m.senderId === currentUserId;
  const firstOfRun =
    newDay ||
    !previous ||
    previous.senderId !== m.senderId ||
    previous.type === "SYSTEM" ||
    new Date(m.createdAt).getTime() - new Date(previous.createdAt).getTime() > RUN_GAP_MS;
  const removed = !!m.deletedAt;
  const saved = !m.pending && !m.failed;
  const canEdit = mine && saved && !removed && canPost && new Date().getTime() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const replyRef: ChatReplyRef = { id: m.id, seq: m.seq, senderName: m.sender.name, preview: m.content.slice(0, 140), deleted: false };

  return (
    <div>
      {separator}
      <div className={cn("group/message flex flex-col px-3 sm:px-4", mine ? "items-end" : "items-start", firstOfRun ? "mt-2" : "mt-0.5")}>
        {firstOfRun && !mine && isGroup && (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">{m.sender.name ?? "Member"}</span>
        )}
        <div className={cn("flex max-w-full items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            className={cn(
              "max-w-[min(85vw,36rem)] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
              mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
              m.pending && "opacity-70",
              m.failed && "bg-destructive/10 text-foreground ring-1 ring-destructive/40",
              removed && "bg-transparent text-muted-foreground italic ring-1 ring-border",
              pinned && !removed && "ring-2 ring-amber/70"
            )}
          >
            {m.replyTo && !removed && (
              <button
                type="button"
                onClick={() => actions.onJumpTo(m.replyTo!.seq)}
                className={cn(
                  "mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary/50 bg-background/60"
                )}
              >
                <span className="font-medium">{m.replyTo.senderName ?? "Someone"}</span>
                <span className="line-clamp-1 opacity-80">{m.replyTo.deleted ? "Message removed" : m.replyTo.preview}</span>
              </button>
            )}
            {removed ? (m.removedByModerator ? "Removed by a moderator" : "Message deleted") : m.content}
            {m.editedAt && !removed && <span className="ml-1.5 text-[10px] opacity-70">(edited)</span>}
          </div>

          {saved && !removed && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Message actions"
                className="rounded-md p-1 text-muted-foreground opacity-0 outline-none group-hover/message:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:opacity-100 [@media(hover:none)]:opacity-60"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"} className="w-52">
                {canPost && (
                  <>
                    <DropdownMenuGroup className="grid grid-cols-4 gap-0.5 p-1">
                      {REACTIONS.map((emoji) => (
                        <DropdownMenuItem key={emoji} aria-label={`React with ${emoji}`} className="justify-center text-lg" onClick={() => actions.onReact(m.id, emoji)}>
                          {emoji}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => actions.onReply(replyRef)}>
                      <CornerUpLeft /> Reply
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.content).then(() => toast.success("Copied"), () => {})}>
                  <Copy /> Copy text
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => actions.onEdit(m)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                )}
                {canModerate && isGroup && (
                  <DropdownMenuItem onClick={() => actions.onPin(m)}>
                    <Pin /> {pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                )}
                {mine && (
                  <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(m)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                )}
                {!mine && canModerate && (
                  <DropdownMenuItem variant="destructive" onClick={() => actions.onRemove(m)}>
                    <ShieldX /> Remove message
                  </DropdownMenuItem>
                )}
                {!mine && (
                  <DropdownMenuItem onClick={() => actions.onReport(m)}>
                    <Flag /> Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {m.reactions.length > 0 && !removed && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
            {m.reactions.map((r) => {
              const reacted = r.userIds.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  disabled={!canPost}
                  aria-pressed={reacted}
                  aria-label={`${r.emoji} ${r.count}${reacted ? ", including you" : ""}`}
                  onClick={() => actions.onReact(m.id, r.emoji)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    reacted ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-muted"
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="tabular-nums">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
          {m.failed ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <AlertCircle className="size-3" aria-hidden />
              Not sent ·
              <button type="button" onClick={() => actions.onRetry(m)} className="inline-flex items-center gap-1 underline">
                <RotateCcw className="size-3" aria-hidden />
                Retry
              </button>
              <button type="button" onClick={() => actions.onDiscard(m)} className="underline">
                Discard
              </button>
            </span>
          ) : m.pending ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              Sending
            </span>
          ) : (
            <span suppressHydrationWarning>{timeOf(m.createdAt)}</span>
          )}
          {seen ? (
            <span className="inline-flex items-center gap-0.5 text-primary">
              <CheckCheck className="size-3" aria-hidden />
              Seen
            </span>
          ) : (
            mine && saved && <Check className="size-3" aria-label="Sent" />
          )}
        </div>
      </div>
    </div>
  );
});

export function MessageThread({
  title,
  subtitle,
  headerExtra,
  currentUserId,
  isDirect,
  isGroup,
  canPost,
  postingBlockedReason,
  canModerate,
  pinnedMessageId,
  connectionNote,
  thread,
  onBack,
  onHide,
  onReport,
  onPin,
  onTyping,
  onOpenDetails,
}: {
  title: string;
  subtitle: React.ReactNode;
  /** Channel tabs for a course community. */
  headerExtra?: React.ReactNode;
  currentUserId: string;
  isDirect: boolean;
  isGroup: boolean;
  canPost: boolean;
  postingBlockedReason: string | null;
  canModerate: boolean;
  pinnedMessageId: string | null;
  connectionNote: string | null;
  thread: {
    messages: ChatMessage[];
    loading: boolean;
    hasEarlier: boolean;
    loadingEarlier: boolean;
    loadEarlier: () => Promise<void>;
    typing: Map<string, string>;
    othersReadSeq: number;
    send: (text: string, replyTo?: ChatReplyRef | null) => void;
    retry: (message: ChatMessage) => void;
    discard: (message: ChatMessage) => void;
    edit: (messageId: string, content: string) => void;
    remove: (messageId: string) => void;
    react: (messageId: string, emoji: string) => void;
  };
  onBack: () => void;
  /** A moderator removes someone else's message. */
  onHide: (messageId: string) => void;
  onReport: (messageId: string, reason: string) => Promise<void>;
  onPin: (messageId: string | null) => void;
  onTyping: (typing: boolean) => void;
  onOpenDetails: () => void;
}) {
  const { messages } = thread;
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [confirm, setConfirm] = useState<{ message: ChatMessage; moderator: boolean } | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const listRef = useRef<VirtuosoHandle>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const typingSent = useRef(0);

  const [today, yesterday] = useMemo(() => {
    const now = new Date();
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [now.toISOString().slice(0, 10), y.toISOString().slice(0, 10)];
  }, []);

  // Older messages are prepended: move the virtual list's first index back by as many as arrived,
  // so the reader stays where they were instead of jumping. Derived from the previous render's
  // first message so it changes in the same render as the data - an effect would be a frame late.
  const [anchor, setAnchor] = useState<{ id: string | null; index: number }>({ id: null, index: START_INDEX });
  let firstItemIndex = anchor.index;
  if (messages.length > 0 && messages[0].id !== anchor.id) {
    const prepended = anchor.id ? messages.findIndex((m) => m.id === anchor.id) : 0;
    if (prepended > 0) firstItemIndex = anchor.index - prepended;
    setAnchor({ id: messages[0].id, index: firstItemIndex });
  }

  // Count what arrives while the reader is scrolled up; never yank them down to it.
  const lastCount = useRef(0);
  useEffect(() => {
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (atBottom) {
      queueMicrotask(() => setUnseenBelow(0));
      return;
    }
    const last = messages.at(-1);
    if (added > 0 && last && last.senderId !== currentUserId) queueMicrotask(() => setUnseenBelow((n) => n + added));
  }, [messages, atBottom, currentUserId]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  useEffect(() => {
    queueMicrotask(() => setDraft(editing ? editing.content : ""));
    if (editing || replyTo) textarea.current?.focus();
  }, [editing, replyTo]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
    setUnseenBelow(0);
  }, []);

  function submit() {
    const text = draft.trim();
    if (!text || text.length > MAX_LENGTH) return;
    if (editing) {
      if (text !== editing.content) thread.edit(editing.id, text);
      setEditing(null);
    } else {
      thread.send(text, replyTo);
      setReplyTo(null);
      requestAnimationFrame(jumpToLatest);
    }
    setDraft("");
    clearTimeout(typingTimer.current);
    typingSent.current = 0;
    onTyping(false);
  }

  function changeDraft(value: string) {
    setDraft(value);
    if (editing) return;
    const now = Date.now();
    if (value.trim() && now - typingSent.current > 2000) {
      typingSent.current = now;
      onTyping(true);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingSent.current = 0;
      onTyping(false);
    }, 3000);
  }

  const actions = useMemo<ThreadActions>(
    () => ({
      onReply: (ref) => {
        setEditing(null);
        setReplyTo(ref);
      },
      onEdit: (message) => {
        setReplyTo(null);
        setEditing(message);
      },
      onDelete: (message) => setConfirm({ message, moderator: false }),
      onRemove: (message) => setConfirm({ message, moderator: true }),
      onReact: (messageId, emoji) => thread.react(messageId, emoji),
      onReport: (message) => {
        setReportReason("");
        setReporting(message);
      },
      onPin: (message) => onPin(pinnedMessageId === message.id ? null : message.id),
      onRetry: (message) => thread.retry(message),
      onDiscard: (message) => thread.discard(message),
      onJumpTo: (seq) => {
        const index = messages.findIndex((m) => m.seq === seq);
        if (index === -1) toast.info("That message is further back - load earlier messages to see it.");
        else listRef.current?.scrollToIndex({ index, align: "center", behavior: "smooth" });
      },
    }),
    [thread, messages, onPin, pinnedMessageId]
  );

  const lastOwnSaved = [...messages].reverse().find((m) => m.senderId === currentUserId && !m.pending && !m.failed);
  const typingNames = [...thread.typing.values()];
  const typingText =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : "Several people are typing…";
  const pinnedMessage = pinnedMessageId ? messages.find((m) => m.id === pinnedMessageId) : null;

  return (
    <section aria-label={`Conversation: ${title}`} className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-base font-semibold">{title}</h2>
          <div className="truncate text-xs text-muted-foreground" aria-live="polite">
            {typingText ? <span className="text-primary">{typingText}</span> : subtitle}
          </div>
        </div>
        {connectionNote && <span className="shrink-0 text-xs text-amber-foreground dark:text-amber">{connectionNote}</span>}
        <Button variant="ghost" size="icon-sm" onClick={onOpenDetails} aria-label="Conversation details">
          <Info aria-hidden />
        </Button>
      </header>
      {headerExtra}
      {pinnedMessage && !pinnedMessage.deletedAt && (
        <button
          type="button"
          onClick={() => actions.onJumpTo(pinnedMessage.seq)}
          className="flex items-center gap-2 border-b bg-amber/10 px-4 py-1.5 text-left text-xs hover:bg-amber/20"
        >
          <Pin className="size-3.5 shrink-0 text-amber-foreground dark:text-amber" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{pinnedMessage.sender.name ?? "Pinned"}:</span> {pinnedMessage.content}
          </span>
        </button>
      )}

      <div className="relative min-h-0 flex-1">
        {thread.loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading messages…</p>}
        {!thread.loading && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
        )}
        {!thread.loading && messages.length > 0 && (
          <Virtuoso
            ref={listRef}
            className="h-full"
            data={messages}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={{ index: messages.length - 1, align: "end" }}
            computeItemKey={(_, m) => m.id}
            followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}
            atBottomStateChange={setAtBottom}
            atBottomThreshold={80}
            increaseViewportBy={{ top: 600, bottom: 200 }}
            startReached={() => void thread.loadEarlier()}
            components={{
              Header: () => (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  {thread.hasEarlier ? (
                    <Button variant="ghost" size="sm" onClick={() => void thread.loadEarlier()} disabled={thread.loadingEarlier}>
                      {thread.loadingEarlier ? "Loading…" : "Load earlier messages"}
                    </Button>
                  ) : (
                    "This is the start of the conversation"
                  )}
                </div>
              ),
              Footer: () => <div className="h-3" />,
            }}
            itemContent={(index, m) => {
              const i = index - firstItemIndex;
              return (
                <MessageRow
                  message={m}
                  previous={messages[i - 1]}
                  currentUserId={currentUserId}
                  isGroup={isGroup}
                  canPost={canPost}
                  canModerate={canModerate}
                  seen={isDirect && m.senderId === currentUserId && m.id === lastOwnSaved?.id && thread.othersReadSeq >= m.seq}
                  pinned={m.id === pinnedMessageId}
                  today={today}
                  yesterday={yesterday}
                  actions={actions}
                />
              );
            }}
          />
        )}
        {unseenBelow > 0 && (
          <Button size="sm" className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md" onClick={jumpToLatest}>
            <ArrowDown aria-hidden />
            {unseenBelow} new {unseenBelow === 1 ? "message" : "messages"}
          </Button>
        )}
      </div>

      {!canPost ? (
        <div className="border-t bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">{postingBlockedReason ?? "You can read this conversation but not post in it."}</div>
      ) : (
        <>
          {(replyTo || editing) && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1.5 text-xs">
              {editing ? <Pencil className="size-3.5 shrink-0" aria-hidden /> : <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{editing ? "Editing message" : `Replying to ${replyTo?.senderName ?? "message"}`}</p>
                {!editing && replyTo && <p className="truncate text-muted-foreground">{replyTo.preview}</p>}
              </div>
              <button
                type="button"
                aria-label={editing ? "Cancel editing" : "Cancel reply"}
                onClick={() => (editing ? setEditing(null) : setReplyTo(null))}
                className="rounded p-1 hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
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
              ref={textarea}
              value={draft}
              onChange={(e) => changeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  if (editing) setEditing(null);
                  else if (replyTo) setReplyTo(null);
                }
              }}
              placeholder="Write a message… (Shift+Enter for a new line)"
              rows={1}
              maxLength={MAX_LENGTH}
              className="max-h-40 min-h-9 resize-none [field-sizing:content]"
            />
            <Button type="submit" disabled={!draft.trim()}>
              {editing ? "Save" : "Send"}
            </Button>
          </form>
          {draft.length > MAX_LENGTH - 200 && (
            <p className="px-4 pb-2 text-right text-xs text-muted-foreground">
              {draft.length} / {MAX_LENGTH}
            </p>
          )}
        </>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.moderator ? "Remove this message?" : "Delete this message?"}</DialogTitle>
            <DialogDescription>
              {confirm?.moderator
                ? "Everyone in the conversation will see that a moderator removed it. This is logged."
                : "It will be removed for everyone. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirm) return;
                if (confirm.moderator) onHide(confirm.message.id);
                else thread.remove(confirm.message.id);
                setConfirm(null);
              }}
            >
              {confirm?.moderator ? "Remove" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reporting} onOpenChange={(open) => !open && setReporting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this message</DialogTitle>
            <DialogDescription>Our support team will review it. The sender isn&apos;t told who reported it.</DialogDescription>
          </DialogHeader>
          <Textarea value={reportReason} maxLength={300} onChange={(e) => setReportReason(e.target.value)} placeholder="What's wrong with it? (optional)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reporting) return;
                void onReport(reporting.id, reportReason);
                setReporting(null);
              }}
            >
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
