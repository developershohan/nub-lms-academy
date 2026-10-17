"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare, PenSquare, X } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";
import {
  startDirectConversationAction,
  startCourseGroupConversationAction,
  startSupportConversationAction,
  hideMessageAction,
} from "@/components/chat/actions";
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

type InboxUpdate = {
  conversationId: string;
  unread: number;
  lastSeq?: number;
  lastMessageAt?: string;
  preview?: string;
};

const byActivity = (a: ConversationSummary, b: ConversationSummary) =>
  (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");

const TYPE_LABEL: Record<ConversationSummary["type"], string> = {
  DIRECT: "Direct message",
  COURSE_GROUP: "Course group",
  SUPPORT: "Support",
};

/**
 * The inbox: conversations on the left (newest activity first, with unread counts that update
 * live), the open conversation on the right. On phones it is one or the other. `?c=<id>` (what
 * notification links carry) opens a conversation directly.
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
  isModerator?: boolean;
  /** Admin/support "chat with anyone" - a live user search instead of a fixed contact list. */
  allowStaffSearch?: boolean;
  /** Shown in the message pane until the first conversation exists; defaults to a generic prompt. */
  emptyState?: React.ReactNode;
}) {
  const router = useRouter();
  const { socket, connected, error: socketError } = useSocket();
  const [conversations, setConversations] = useState(() => [...initialConversations].sort(byActivity));
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && initialConversations.some((c) => c.id === initialSelectedId) ? initialSelectedId : null
  );
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(initialConversations.length === 0 && contacts.length > 0);

  const thread = useChatThread({ conversationId: selectedId, socket, connected, currentUser });

  // A server re-render (new conversation elsewhere) brings fresh summaries: merge them in.
  useEffect(() => {
    queueMicrotask(() =>
      setConversations((current) => {
        const known = new Map(current.map((c) => [c.id, c]));
        return initialConversations.map((c) => ({ ...c, unread: known.has(c.id) ? known.get(c.id)!.unread : c.unread })).sort(byActivity);
      })
    );
  }, [initialConversations]);

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
        return current
          .map((c) =>
            c.id !== update.conversationId
              ? c
              : {
                  ...c,
                  // The open conversation is being read as it arrives.
                  unread: c.id === selectedId && document.visibilityState === "visible" ? 0 : update.unread,
                  ...(update.lastSeq
                    ? { lastSeq: update.lastSeq, lastMessageAt: update.lastMessageAt ?? c.lastMessageAt, lastMessage: update.preview ?? c.lastMessage }
                    : {}),
                }
          )
          .sort(byActivity);
      });
      // Someone started a conversation with this user: re-render the page to list it.
      if (unknown) router.refresh();
    };
    socket.on("conversation:updated", onUpdate);
    return () => {
      socket.off("conversation:updated", onUpdate);
    };
  }, [socket, selectedId, router]);

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

  function addAndOpen(result: { error?: string; conversationId?: string }, summary: Omit<ConversationSummary, "id">) {
    if (result.error || !result.conversationId) return toast.error(result.error ?? "Could not open the conversation");
    const id = result.conversationId;
    setConversations((current) => (current.some((c) => c.id === id) ? current : [{ id, ...summary }, ...current]));
    openConversation(id);
  }

  const blank = { lastMessage: null, lastMessageAt: null, unread: 0, lastSeq: 0 };
  const startDirect = async (userId: string, label = "Direct message") =>
    addAndOpen(await startDirectConversationAction(userId), { type: "DIRECT", label, otherUserId: userId, ...blank });
  const startGroup = async (courseId: string, label: string) =>
    addAndOpen(await startCourseGroupConversationAction(courseId), { type: "COURSE_GROUP", label, otherUserId: null, ...blank });
  const contactSupport = async () =>
    addAndOpen(await startSupportConversationAction(), { type: "SUPPORT", label: "Support", otherUserId: null, ...blank });

  async function hide(messageId: string) {
    const result = await hideMessageAction(messageId);
    if ("error" in result) return toast.error(result.error);
    thread.markHidden(messageId);
  }

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
  const otherOnline = selected?.otherUserId ? thread.online.has(selected.otherUserId) : false;
  const connectionNote = connected ? null : socketError ? "Offline - messages send when you're back" : "Connecting…";
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="grid h-[calc(100dvh-11rem)] min-h-[480px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-[320px_minmax(0,1fr)]">
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
            onSelectContact={(contact) =>
              contact.kind === "direct" ? startDirect(contact.id, contact.label) : startGroup(contact.id, contact.label)
            }
            onContactSupport={contactSupport}
            onSelectUser={(userId) => startDirect(userId)}
          />
        )}
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          query={query}
          onQueryChange={setQuery}
          onSelect={openConversation}
        />
      </aside>

      <div className={cn("min-h-0", !selected && "hidden md:block")}>
        {selected ? (
          <MessageThread
            title={selected.label}
            subtitle={
              selected.type === "DIRECT" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", otherOnline ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />
                  {otherOnline ? "Online" : "Direct message"}
                </span>
              ) : (
                TYPE_LABEL[selected.type]
              )
            }
            currentUserId={currentUser.id}
            isDirect={selected.type === "DIRECT"}
            isModerator={isModerator}
            connectionNote={connectionNote}
            thread={thread}
            onBack={closeConversation}
            onHide={hide}
            onTyping={(typing) => socket?.emit(typing ? "typing:start" : "typing:stop", selected.id)}
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
    </div>
  );
}
