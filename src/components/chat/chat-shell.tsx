"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";
import {
  startDirectConversationAction,
  startCourseGroupConversationAction,
  startSupportConversationAction,
  hideMessageAction,
} from "@/components/chat/actions";
import { StaffContactPanel } from "@/components/chat/staff-contact-panel";

type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  sender: { id: string; name: string | null };
};

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

export function ChatShell({
  currentUser,
  initialConversations,
  contacts = [],
  showContactSupport = false,
  isModerator = false,
  allowStaffSearch = false,
  emptyState,
}: {
  currentUser: { id: string; name: string | null };
  initialConversations: ConversationSummary[];
  contacts?: ChatContact[];
  showContactSupport?: boolean;
  isModerator?: boolean;
  /** Admin/support "chat with anyone" - a live user search instead of a fixed contact list. */
  allowStaffSearch?: boolean;
  /** Shown in the message pane until the first conversation exists; defaults to a generic prompt. */
  emptyState?: React.ReactNode;
}) {
  const { socket, connected, error: socketError } = useSocket();
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [typingLabel, setTypingLabel] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [seenByOther, setSeenByOther] = useState(false);
  const [draft, setDraft] = useState("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prependedEarlier = useRef(false);

  useEffect(() => {
    if (!socket) return;

    const onOnline = ({ userId }: { userId: string }) =>
      setOnlineUsers((prev) => new Set(prev).add(userId));
    const onOffline = ({ userId }: { userId: string }) =>
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });

    socket.on("user:online", onOnline);
    socket.on("user:offline", onOffline);
    return () => {
      socket.off("user:online", onOnline);
      socket.off("user:offline", onOffline);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !selectedId) return;
    let cancelled = false;

    const join = () => {
      socket.emit("conversation:join", selectedId);
      socket.emit("message:read", selectedId);
    };
    const loadLatest = () =>
      fetch(`/api/v1/chat/conversations/${selectedId}/messages`)
        .then((res) => res.json())
        .then((data) => {
          // A slow response for a conversation the user already left must not overwrite this one.
          if (cancelled) return;
          setMessages(data.messages ?? []);
          setHasEarlier(!!data.hasMore);
        })
        .finally(() => {
          if (!cancelled) setLoadingMessages(false);
        });

    // While disconnected, socket.io would buffer the join and onConnect below sends it anyway.
    if (socket.connected) join();
    // Deferred one tick: setState must not be called synchronously from inside an effect body.
    queueMicrotask(() => {
      setSeenByOther(false);
      setTypingLabel(null);
      setLoadingMessages(true);
      // Presence is per conversation room - the join above re-announces whoever is here.
      setOnlineUsers(new Set());
    });
    loadLatest();

    // A reconnect (network blip, server restart, laptop waking up) is a brand-new server-side
    // socket that isn't in any conversation room - without re-joining, the open conversation
    // silently stops receiving messages. Refetch too, so anything sent meanwhile shows up.
    const onConnect = () => {
      join();
      loadLatest();
    };

    const onNewMessage = (message: ChatMessage) => {
      if (message.conversationId !== selectedId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === message.conversationId
              ? { ...c, lastMessage: message.content, lastMessageAt: message.createdAt, unread: true }
              : c
          )
        );
        return;
      }
      setMessages((prev) => [...prev, message]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, lastMessage: message.content, lastMessageAt: message.createdAt } : c
        )
      );
      if (message.senderId !== currentUser.id) socket.emit("message:read", selectedId);
    };
    const onTypingStart = (payload: { conversationId: string; userId: string; name: string | null }) => {
      if (payload.conversationId === selectedId && payload.userId !== currentUser.id) {
        setTypingLabel(payload.name ?? "Someone");
      }
    };
    const onTypingStop = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId === selectedId && payload.userId !== currentUser.id) setTypingLabel(null);
    };
    const onRead = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId === selectedId && payload.userId !== currentUser.id) setSeenByOther(true);
    };

    socket.on("connect", onConnect);
    socket.on("message:new", onNewMessage);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:read", onRead);

    return () => {
      cancelled = true;
      socket.emit("conversation:leave", selectedId);
      socket.off("connect", onConnect);
      socket.off("message:new", onNewMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:read", onRead);
    };
  }, [socket, selectedId, currentUser.id]);

  useEffect(() => {
    // Prepending older history shouldn't yank the view back to the bottom.
    if (prependedEarlier.current) {
      prependedEarlier.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!selectedId || !oldest) return;
    const conversationId = selectedId;
    setLoadingEarlier(true);
    try {
      const res = await fetch(
        `/api/v1/chat/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.id)}`
      );
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not load earlier messages");
      prependedEarlier.current = true;
      setMessages((prev) => (prev[0]?.conversationId === conversationId ? [...(data.messages ?? []), ...prev] : prev));
      setHasEarlier(!!data.hasMore);
    } finally {
      setLoadingEarlier(false);
    }
  }

  function openConversation(conversationId: string) {
    setSelectedId(conversationId);
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread: false } : c)));
  }

  async function handleStartDirect(userId: string) {
    const result = await startDirectConversationAction(userId);
    if ("error" in result) return toast.error(result.error);
    if (!conversations.some((c) => c.id === result.conversationId)) {
      setConversations((prev) => [
        { id: result.conversationId, type: "DIRECT", label: "Direct message", lastMessage: null, lastMessageAt: null, unread: false },
        ...prev,
      ]);
    }
    openConversation(result.conversationId);
  }

  async function handleStartCourseGroup(courseId: string, label: string) {
    const result = await startCourseGroupConversationAction(courseId);
    if ("error" in result) return toast.error(result.error);
    if (!conversations.some((c) => c.id === result.conversationId)) {
      setConversations((prev) => [
        { id: result.conversationId, type: "COURSE_GROUP", label, lastMessage: null, lastMessageAt: null, unread: false },
        ...prev,
      ]);
    }
    openConversation(result.conversationId);
  }

  async function handleContactSupport() {
    const result = await startSupportConversationAction();
    if ("error" in result) return toast.error(result.error);
    if (!conversations.some((c) => c.id === result.conversationId)) {
      setConversations((prev) => [
        { id: result.conversationId, type: "SUPPORT", label: "Support", lastMessage: null, lastMessageAt: null, unread: false },
        ...prev,
      ]);
    }
    openConversation(result.conversationId);
  }

  function handleSend() {
    if (!socket || !selectedId || !draft.trim()) return;
    socket.emit("message:send", { conversationId: selectedId, content: draft.trim() }, (res: { error?: string }) => {
      if (res?.error) toast.error(res.error);
    });
    setDraft("");
    socket.emit("typing:stop", selectedId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!socket || !selectedId) return;
    socket.emit("typing:start", selectedId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit("typing:stop", selectedId), 2000);
  }

  async function handleHide(messageId: string) {
    const result = await hideMessageAction(messageId);
    if ("error" in result) return toast.error(result.error);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)));
  }

  function handleContactClick(contact: ChatContact) {
    if (contact.kind === "direct") return handleStartDirect(contact.id);
    return handleStartCourseGroup(contact.id, contact.label);
  }

  const selected = conversations.find((c) => c.id === selectedId);

  const listContacts = contacts.filter((c) => !c.dropdown);
  const dropdownContacts = contacts.filter((c) => c.dropdown);
  const listGroups = new Map<string, ChatContact[]>();
  for (const contact of listContacts) {
    const key = contact.group ?? "";
    listGroups.set(key, [...(listGroups.get(key) ?? []), contact]);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        {(dropdownContacts.length > 0 || showContactSupport || allowStaffSearch) && (
          <StaffContactPanel
            dropdownContacts={dropdownContacts}
            showContactSupport={showContactSupport}
            allowStaffSearch={allowStaffSearch}
            onSelectContact={handleContactClick}
            onContactSupport={handleContactSupport}
            onSelectUser={handleStartDirect}
          />
        )}

        {listContacts.length > 0 && (
          <div className="space-y-3 rounded-lg border p-3">
            {[...listGroups.entries()].map(([group, groupContacts]) => (
              <div key={group || "_"} className="space-y-1.5">
                {group && <p className="text-xs font-medium text-muted-foreground">{group}</p>}
                {groupContacts.map((contact) => (
                  <Button
                    key={`${contact.kind}-${contact.id}`}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleContactClick(contact)}
                  >
                    {contact.label}
                    {contact.kind === "course_group" && " (group)"}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "block w-full rounded-md border p-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                c.id === selectedId ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.label}</span>
                {c.unread && <Badge variant="secondary">New</Badge>}
              </div>
              {c.lastMessage && <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-[420px] flex-col rounded-lg border">
        {!selected && conversations.length === 0 ? (
          (emptyState ?? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Pick someone from the list to start chatting. New messages arrive instantly."
              className="flex-1 justify-center rounded-none border-0 bg-transparent"
            />
          ))
        ) : !selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessagesSquare className="size-6" aria-hidden />
            Select a conversation
          </div>
        ) : (
          <>
            <div className="border-b p-3 text-sm font-medium">
              {selected.label}
              {!connected && socketError && (
                <span className="ml-2 text-xs text-destructive">({socketError})</span>
              )}
              {!connected && !socketError && (
                <span className="ml-2 text-xs text-muted-foreground">(connecting...)</span>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {loadingMessages && <p className="text-sm text-muted-foreground">Loading...</p>}
              {!loadingMessages && hasEarlier && (
                <Button variant="ghost" size="sm" className="mx-auto block" onClick={loadEarlier} disabled={loadingEarlier}>
                  {loadingEarlier ? "Loading..." : "Load earlier messages"}
                </Button>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.senderId === currentUser.id ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                  {m.senderId !== currentUser.id && (
                    <p className="mb-0.5 text-xs font-medium opacity-70">
                      {m.sender.name ?? "User"}
                      {onlineUsers.has(m.senderId) && " · online"}
                    </p>
                  )}
                  <p>{m.deletedAt ? <em className="opacity-70">Message removed</em> : m.content}</p>
                  {isModerator && !m.deletedAt && (
                    <button onClick={() => handleHide(m.id)} className="mt-1 text-xs underline opacity-70">
                      Hide
                    </button>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="min-h-5 px-3 text-xs text-muted-foreground">
              {typingLabel ? `${typingLabel} is typing...` : seenByOther ? "Seen" : ""}
            </div>
            <div className="flex gap-2 border-t p-3">
              <Textarea
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Write a message..."
                rows={1}
                className="min-h-9 resize-none"
              />
              <Button onClick={handleSend} disabled={!connected || !draft.trim()}>
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
