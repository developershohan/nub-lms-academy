"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MessagesSquare, PenSquare, X } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";
import type { TicketWire } from "@/server/chat/support";
import {
  getConversationSummaryAction,
  hideMessageAction,
  pinMessageAction,
  reportMessageAction,
  startCourseGroupConversationAction,
  startDirectConversationAction,
  startSupportConversationAction,
} from "@/components/chat/actions";
import { ChatDetails } from "@/components/chat/chat-details";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { NewConversationPanel } from "@/components/chat/new-conversation-panel";
import { useChatThread } from "@/components/chat/use-chat-thread";

export type ChatContact = {
  kind: "direct" | "course_group";
  id: string; // userId for "direct", courseId for "course_group"
  label: string;
  /** Section heading when rendered in the list (e.g. "Classmates", "Course A"). Ignored for
   * dropdown contacts, which are grouped under a single "Staff" selector instead. */
  group?: string;
  /** Renders inside the compact staff selector instead of the browsable list - use for the
   * small, fixed set of admin/sub-instructor/support contacts, not a potentially-long student list. */
  dropdown?: boolean;
};

/** What conversation:updated carries. Every field is optional: a message brings the preview and
 * counts, a read just the count, a block or mute just that. */
type InboxUpdate = Partial<
  Pick<ConversationSummary, "unread" | "lastSeq" | "lastMessageAt" | "blocked" | "canPost" | "postingBlockedReason" | "mutedUntil" | "ticket">
> & { conversationId: string; preview?: string };

const CHANNEL_ORDER = ["GENERAL", "ANNOUNCEMENTS", "QA", "BATCH"] as const;

/**
 * Most recent activity first, with each course's channels kept together (#general,
 * #announcements, #q-and-a, then batches), placed by the course's latest message.
 */
function sortInbox(list: ConversationSummary[]) {
  const group = (c: ConversationSummary) => (c.type === "COURSE_GROUP" && c.courseId ? `course:${c.courseId}` : c.id);
  const latest = new Map<string, string>();
  for (const c of list) {
    const key = group(c);
    const at = c.lastMessageAt ?? "";
    if (!latest.has(key) || at > latest.get(key)!) latest.set(key, at);
  }
  return [...list].sort((a, b) => {
    const [ga, gb] = [group(a), group(b)];
    // Ties fall back to the group key, so a course's channels can't be split by another conversation.
    if (ga !== gb) return latest.get(gb)!.localeCompare(latest.get(ga)!) || ga.localeCompare(gb);
    return CHANNEL_ORDER.indexOf(a.channel ?? "GENERAL") - CHANNEL_ORDER.indexOf(b.channel ?? "GENERAL") || a.label.localeCompare(b.label);
  });
}

const TYPE_LABEL: Record<ConversationSummary["type"], string> = {
  DIRECT: "Direct message",
  COURSE_GROUP: "Course channel",
  SUPPORT: "Support",
};
const TICKET_STATUS = { OPEN: "Open", PENDING: "Waiting on you", RESOLVED: "Resolved", CLOSED: "Closed" } as const;

const wideQuery = "(min-width: 1280px)";
function useIsWide() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(wideQuery);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(wideQuery).matches,
    () => true
  );
}

/**
 * The inbox: conversations on the left (newest activity first, with unread counts that update
 * live), the open conversation in the middle, details on the right. On phones it is one at a
 * time. `?c=<id>` (what notification links carry) opens a conversation directly. A course's
 * channels (#general, #announcements, #q-and-a, batches) show as tabs above its thread.
 */
export function ChatShell({
  currentUser,
  initialConversations,
  initialSelectedId = null,
  contacts = [],
  showContactSupport = false,
  isModerator = false,
  allowStaffSearch = false,
  emptyState,
}: {
  currentUser: { id: string; name: string | null };
  initialConversations: ConversationSummary[];
  initialSelectedId?: string | null;
  contacts?: ChatContact[];
  showContactSupport?: boolean;
  /** Staff: may read any conversation and remove messages anywhere. */
  isModerator?: boolean;
  /** Admin/support "chat with anyone" - a live user search instead of a fixed contact list. */
  allowStaffSearch?: boolean;
  /** Shown in the message pane until the first conversation exists; defaults to a generic prompt. */
  emptyState?: React.ReactNode;
}) {
  const { socket, connected, error: socketError } = useSocket();
  const [conversations, setConversations] = useState(() => sortInbox(initialConversations));
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && initialConversations.some((c) => c.id === initialSelectedId) ? initialSelectedId : null
  );
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(initialConversations.length === 0 && contacts.length > 0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const isWide = useIsWide();

  const thread = useChatThread({ conversationId: selectedId, socket, connected, currentUser });

  // A server re-render (new conversation elsewhere) brings fresh summaries: merge them in.
  useEffect(() => {
    queueMicrotask(() =>
      setConversations((current) => {
        const known = new Map(current.map((c) => [c.id, c]));
        return sortInbox(initialConversations.map((c) => ({ ...c, unread: known.has(c.id) ? known.get(c.id)!.unread : c.unread })));
      })
    );
  }, [initialConversations]);

  /** A conversation this inbox doesn't list yet (a DM someone just started, a new channel). */
  const addConversation = useCallback(async (conversationId: string) => {
    const result = await getConversationSummaryAction(conversationId);
    if ("error" in result) return;
    const summary = result.conversation;
    setConversations((current) => (current.some((c) => c.id === summary.id) ? current : sortInbox([summary, ...current])));
  }, []);

  // A notification link to a conversation this user isn't a member of (staff opening a ticket).
  useEffect(() => {
    if (!initialSelectedId || initialConversations.some((c) => c.id === initialSelectedId)) return;
    void getConversationSummaryAction(initialSelectedId).then((result) => {
      if ("error" in result) return;
      setConversations((current) => (current.some((c) => c.id === result.conversation.id) ? current : [result.conversation, ...current]));
      setSelectedId(result.conversation.id);
    });
  }, [initialSelectedId, initialConversations]);

  // Live inbox: every member's room gets conversation:updated with their own unread count.
  useEffect(() => {
    if (!socket) return;
    const onUpdate = (update: InboxUpdate) => {
      let unknown = false;
      setConversations((current) => {
        if (!current.some((c) => c.id === update.conversationId)) {
          unknown = !!update.lastSeq;
          return current;
        }
        return sortInbox(
          current.map((c) => {
            if (c.id !== update.conversationId) return c;
            const { conversationId: _id, preview, unread, ...rest } = update;
            void _id;
            return {
              ...c,
              ...rest,
              // The open conversation is being read as it arrives.
              ...(unread !== undefined ? { unread: c.id === selectedId && document.visibilityState === "visible" ? 0 : unread } : {}),
              ...(preview !== undefined ? { lastMessage: preview } : {}),
            };
          })
        );
      });
      // Someone started a conversation with this user: fetch it and list it.
      if (unknown) void addConversation(update.conversationId);
    };
    const onRemoved = ({ conversationId }: { conversationId: string }) => {
      setConversations((current) => {
        const gone = current.find((c) => c.id === conversationId);
        if (gone) toast.info(`You no longer have access to ${gone.label}.`);
        return current.filter((c) => c.id !== conversationId);
      });
      setSelectedId((id) => (id === conversationId ? null : id));
    };
    const onAdded = ({ conversationId }: { conversationId: string }) => void addConversation(conversationId);
    const onTicket = (ticket: TicketWire) =>
      setConversations((current) => current.map((c) => (c.id === ticket.conversationId ? { ...c, ticket } : c)));
    const onSettings = (s: { conversationId: string; pinnedMessageId?: string | null; slowModeSec?: number }) =>
      setConversations((current) =>
        current.map((c) =>
          c.id === s.conversationId
            ? { ...c, ...(s.pinnedMessageId !== undefined ? { pinnedMessageId: s.pinnedMessageId } : {}), ...(s.slowModeSec !== undefined ? { slowModeSec: s.slowModeSec } : {}) }
            : c
        )
      );
    const onOnline = ({ userId }: { userId: string }) => setOnline((s) => (s.has(userId) ? s : new Set(s).add(userId)));
    const onOffline = ({ userId }: { userId: string }) =>
      setOnline((s) => {
        if (!s.has(userId)) return s;
        const next = new Set(s);
        next.delete(userId);
        return next;
      });
    socket.on("conversation:updated", onUpdate);
    socket.on("conversation:removed", onRemoved);
    socket.on("conversation:added", onAdded);
    socket.on("ticket:updated", onTicket);
    socket.on("conversation:settings", onSettings);
    socket.on("user:online", onOnline);
    socket.on("user:offline", onOffline);
    return () => {
      socket.off("conversation:updated", onUpdate);
      socket.off("conversation:removed", onRemoved);
      socket.off("conversation:added", onAdded);
      socket.off("ticket:updated", onTicket);
      socket.off("conversation:settings", onSettings);
      socket.off("user:online", onOnline);
      socket.off("user:offline", onOffline);
    };
  }, [socket, selectedId, addConversation]);

  // Online dots for the people in DMs (only contacts are ever reported).
  const partnerKey = useMemo(
    () => [...new Set(conversations.flatMap((c) => (c.otherUserId ? [c.otherUserId] : [])))].slice(0, 200).join(","),
    [conversations]
  );
  useEffect(() => {
    if (!socket || !connected || !partnerKey) return;
    socket.timeout(5_000).emit("presence:query", partnerKey.split(","), (err: Error | null, res?: { online?: string[] }) => {
      if (!err && res?.online) setOnline(new Set(res.online));
    });
  }, [socket, connected, partnerKey]);

  function openConversation(id: string) {
    setSelectedId(id);
    setComposing(false);
    setConversations((current) => current.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    const url = new URL(window.location.href);
    url.searchParams.set("c", id);
    window.history.replaceState(null, "", url);
  }

  function closeConversation() {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }

  async function openStarted(result: { error?: string; conversationId?: string }) {
    if (result.error || !result.conversationId) return toast.error(result.error ?? "Could not open the conversation");
    const id = result.conversationId;
    if (!conversations.some((c) => c.id === id)) await addConversation(id);
    openConversation(id);
  }

  const startDirect = async (userId: string) => openStarted(await startDirectConversationAction(userId));
  const startGroup = async (courseId: string) => openStarted(await startCourseGroupConversationAction(courseId));
  const contactSupport = async () => openStarted(await startSupportConversationAction());

  async function hide(messageId: string) {
    const result = await hideMessageAction(messageId);
    if ("error" in result) return toast.error(result.error);
    thread.markHidden(messageId);
  }
  async function report(messageId: string, reason: string) {
    const result = await reportMessageAction(messageId, reason);
    if ("error" in result) toast.error(result.error);
    else toast.success("Thanks - our team will review it.");
  }
  async function pin(conversationId: string, messageId: string | null) {
    const result = await pinMessageAction(conversationId, messageId);
    if ("error" in result) return toast.error(result.error);
    setConversations((current) => current.map((c) => (c.id === conversationId ? { ...c, pinnedMessageId: messageId } : c)));
  }

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
  const patchSelected = (patch: Partial<ConversationSummary>) =>
    setConversations((current) => current.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));

  // A course community: its channels this user belongs to, as tabs above the thread.
  const channels = useMemo(() => {
    if (!selected || selected.type !== "COURSE_GROUP" || !selected.courseId) return [];
    return conversations
      .filter((c) => c.type === "COURSE_GROUP" && c.courseId === selected.courseId)
      .sort((a, b) => CHANNEL_ORDER.indexOf(a.channel ?? "GENERAL") - CHANNEL_ORDER.indexOf(b.channel ?? "GENERAL") || a.label.localeCompare(b.label));
  }, [conversations, selected]);

  const otherOnline = selected?.otherUserId ? online.has(selected.otherUserId) || thread.online.has(selected.otherUserId) : false;
  const connectionNote = connected ? null : socketError ? "Offline - messages send when you're back" : "Connecting…";
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const details = selected ? (
    <ChatDetails
      conversation={selected}
      currentUserId={currentUser.id}
      socket={socket}
      isStaff={isModerator}
      onClose={() => setDetailsOpen(false)}
      onUpdated={patchSelected}
      onBatchCreated={(id) => void addConversation(id).then(() => openConversation(id))}
    />
  ) : null;

  return (
    <div
      className={cn(
        "grid h-[calc(100dvh-11rem)] min-h-[480px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-[320px_minmax(0,1fr)]",
        detailsOpen && selected && isWide && "xl:grid-cols-[320px_minmax(0,1fr)_18rem]"
      )}
    >
      <aside className={cn("flex min-h-0 flex-col border-r", selected && "hidden md:flex")} aria-label="Inbox">
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <h2 className="font-heading text-base font-semibold">
            Inbox
            {totalUnread > 0 && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({totalUnread} unread)</span>}
          </h2>
          {(contacts.length > 0 || showContactSupport || allowStaffSearch) && (
            <Button size="sm" variant={composing ? "ghost" : "outline"} onClick={() => setComposing((v) => !v)}>
              {composing ? <X aria-hidden /> : <PenSquare aria-hidden />}
              {composing ? "Close" : "New message"}
            </Button>
          )}
        </div>
        {composing && (
          <NewConversationPanel
            contacts={contacts}
            showContactSupport={showContactSupport}
            allowStaffSearch={allowStaffSearch}
            onSelectContact={(contact) => (contact.kind === "direct" ? startDirect(contact.id) : startGroup(contact.id))}
            onContactSupport={contactSupport}
            onSelectUser={(userId) => startDirect(userId)}
          />
        )}
        <ConversationList conversations={conversations} selectedId={selectedId} query={query} online={online} onQueryChange={setQuery} onSelect={openConversation} />
      </aside>

      <div className={cn("min-h-0", !selected && "hidden md:block")}>
        {selected ? (
          <MessageThread
            key={selected.id}
            title={selected.type === "COURSE_GROUP" ? (selected.courseTitle ?? selected.label) : selected.label}
            subtitle={
              selected.type === "DIRECT" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", otherOnline ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />
                  {otherOnline ? "Online" : "Direct message"}
                </span>
              ) : selected.type === "SUPPORT" && selected.ticket ? (
                `Support · ${TICKET_STATUS[selected.ticket.status]}`
              ) : selected.type === "COURSE_GROUP" ? (
                thread.online.size > 0 ? `${thread.online.size} online` : TYPE_LABEL.COURSE_GROUP
              ) : (
                TYPE_LABEL[selected.type]
              )
            }
            headerExtra={
              channels.length > 1 && (
                <div role="tablist" aria-label="Channels" className="flex gap-1 overflow-x-auto border-b px-2 py-1.5">
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      role="tab"
                      type="button"
                      aria-selected={c.id === selected.id}
                      onClick={() => openConversation(c.id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        c.id === selected.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {c.channel === "BATCH" ? c.label.split(" · ").pop() : c.channel === "ANNOUNCEMENTS" ? "#announcements" : c.channel === "QA" ? "#q-and-a" : "#general"}
                      {c.unread > 0 && c.id !== selected.id && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{c.unread}</span>}
                    </button>
                  ))}
                </div>
              )
            }
            currentUserId={currentUser.id}
            isDirect={selected.type === "DIRECT"}
            isGroup={selected.type !== "DIRECT"}
            canPost={selected.canPost}
            postingBlockedReason={selected.postingBlockedReason}
            canModerate={selected.canModerate}
            pinnedMessageId={selected.pinnedMessageId}
            connectionNote={connectionNote}
            thread={thread}
            onBack={closeConversation}
            onHide={hide}
            onReport={report}
            onPin={(messageId) => void pin(selected.id, messageId)}
            onTyping={(typing) => socket?.emit(typing ? "typing:start" : "typing:stop", selected.id)}
            onOpenDetails={() => setDetailsOpen((o) => !o)}
          />
        ) : conversations.length === 0 ? (
          (emptyState ?? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Start one with New message. Messages arrive instantly."
              className="h-full justify-center rounded-none border-0 bg-transparent"
            />
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessagesSquare className="size-6" aria-hidden />
            Pick a conversation
          </div>
        )}
      </div>

      {detailsOpen && selected && isWide && <div className="hidden min-h-0 border-l xl:block">{details}</div>}
      {selected && !isWide && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-[min(22rem,90vw)] p-0">
            <SheetTitle className="sr-only">Conversation details</SheetTitle>
            {details}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
