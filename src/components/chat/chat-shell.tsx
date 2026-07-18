"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
}: {
  currentUser: { id: string; name: string | null };
  initialConversations: ConversationSummary[];
  contacts?: ChatContact[];
  showContactSupport?: boolean;
  isModerator?: boolean;
  /** Admin/support "chat with anyone" - a live user search instead of a fixed contact list. */
  allowStaffSearch?: boolean;
}) {
  const { socket, connected, error: socketError } = useSocket();
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingLabel, setTypingLabel] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [seenByOther, setSeenByOther] = useState(false);
  const [draft, setDraft] = useState("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

    socket.emit("conversation:join", selectedId);
    socket.emit("message:read", selectedId);
    // Deferred one tick: setState must not be called synchronously from inside an effect body.
    queueMicrotask(() => {
      setSeenByOther(false);
      setTypingLabel(null);
      setLoadingMessages(true);
    });

    fetch(`/api/v1/chat/conversations/${selectedId}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));

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

    socket.on("message:new", onNewMessage);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:read", onRead);

    return () => {
      socket.emit("conversation:leave", selectedId);
      socket.off("message:new", onNewMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:read", onRead);
    };
  }, [socket, selectedId, currentUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          {conversations.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet.</p>}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "block w-full rounded-md border p-2 text-left text-sm",
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
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
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
