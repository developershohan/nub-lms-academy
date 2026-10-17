"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export type ChatMessage = {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  clientMsgId: string | null;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  sender: { id: string; name: string | null };
  /** Shown straight away, before the server has saved it. */
  pending?: boolean;
  /** Couldn't be sent - the bubble offers a retry with the same clientMsgId. */
  failed?: boolean;
};

const ACK_TIMEOUT_MS = 10_000;

/** Server rows have numbers; a pending message sorts after everything saved. */
const sortKey = (m: ChatMessage) => (m.pending || m.failed ? Number.MAX_SAFE_INTEGER : m.seq);

/** Adds or replaces by id, and swaps a pending copy for the saved one with the same clientMsgId. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    if (message.clientMsgId) byId.delete(`pending:${message.clientMsgId}`);
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => sortKey(a) - sortKey(b) || a.createdAt.localeCompare(b.createdAt));
}

export const newestSeq = (messages: ChatMessage[]) =>
  messages.reduce((max, m) => (m.pending || m.failed ? max : Math.max(max, m.seq)), 0);

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

/**
 * One open conversation: its messages, kept in seq order and live. Sends show at once (pending)
 * and are matched to the saved copy by clientMsgId, so a retry never posts twice. After a
 * reconnect the hook asks for only the messages after the newest it has (the "sync" gap), and it
 * reports reads as "up to seq N" rather than per message.
 */
export function useChatThread({
  conversationId,
  socket,
  connected,
  currentUser,
}: {
  conversationId: string | null;
  socket: Socket | null;
  connected: boolean;
  currentUser: { id: string; name: string | null };
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  /** How far the other members have read - a DM shows "Seen" under your last message from it. */
  const [othersReadSeq, setOthersReadSeq] = useState(0);
  const messagesRef = useRef(messages);
  const lastReadSent = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Tells the server how far this user has read - only forward, and only while the tab is visible. */
  const markRead = useCallback(() => {
    if (!conversationId || document.visibilityState !== "visible") return;
    const seq = newestSeq(messagesRef.current);
    if (seq === 0 || seq <= lastReadSent.current) return;
    lastReadSent.current = seq;
    if (socket?.connected) socket.emit("message:read", { conversationId, seq });
    else void fetch(`/api/v1/chat/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
  }, [conversationId, socket]);

  const loadLatest = useCallback(async () => {
    if (!conversationId) return;
    const data = await getJson(`/api/v1/chat/conversations/${conversationId}/messages`);
    // Keep anything still pending; the page of saved messages replaces the rest.
    setMessages((current) => mergeMessages(current.filter((m) => m.pending || m.failed), data.messages ?? []));
    setHasEarlier(!!data.hasMore);
  }, [conversationId]);

  // Open a conversation: reset, join its room, load the newest page.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    lastReadSent.current = 0;
    queueMicrotask(() => {
      if (cancelled) return;
      setMessages([]);
      setTyping(null);
      setOnline(new Set());
      setOthersReadSeq(0);
      setLoading(true);
    });
    getJson(`/api/v1/chat/conversations/${conversationId}/messages`)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        setHasEarlier(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    if (socket?.connected) socket.emit("conversation:join", conversationId);
    return () => {
      cancelled = true;
      socket?.emit("conversation:leave", conversationId);
    };
  }, [conversationId, socket]);

  // Mark read whenever new messages land in the open, visible conversation.
  useEffect(() => {
    if (!loading) markRead();
  }, [messages, loading, markRead]);

  useEffect(() => {
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  // Live events for the open conversation.
  useEffect(() => {
    if (!socket || !conversationId) return;

    const onConnect = () => {
      // A reconnect is a new server-side socket in no rooms: re-join, then fetch only the gap.
      socket.emit("conversation:join", conversationId);
      const lastSeq = newestSeq(messagesRef.current);
      socket.timeout(ACK_TIMEOUT_MS).emit(
        "sync",
        { conversationId, lastSeq },
        (err: Error | null, res?: { messages?: ChatMessage[]; reset?: boolean; error?: string }) => {
          if (err || !res || res.error || res.reset) {
            void loadLatest().catch(() => {});
            return;
          }
          if (res.messages?.length) setMessages((current) => mergeMessages(current, res.messages!));
        }
      );
    };
    const onNew = (message: ChatMessage) => {
      if (message.conversationId === conversationId) setMessages((current) => mergeMessages(current, [message]));
    };
    const onTypingStart = (p: { conversationId: string; userId: string; name: string | null }) => {
      if (p.conversationId === conversationId && p.userId !== currentUser.id) setTyping(p.name ?? "Someone");
    };
    const onTypingStop = (p: { conversationId: string; userId: string }) => {
      if (p.conversationId === conversationId && p.userId !== currentUser.id) setTyping(null);
    };
    const onRead = (p: { conversationId: string; userId: string; lastReadSeq: number }) => {
      if (p.conversationId === conversationId && p.userId !== currentUser.id) {
        setOthersReadSeq((seq) => Math.max(seq, p.lastReadSeq));
      }
    };
    const onOnline = ({ userId }: { userId: string }) => setOnline((s) => new Set(s).add(userId));
    const onOffline = ({ userId }: { userId: string }) =>
      setOnline((s) => {
        const next = new Set(s);
        next.delete(userId);
        return next;
      });

    socket.on("connect", onConnect);
    socket.on("message:new", onNew);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("conversation:read", onRead);
    socket.on("user:online", onOnline);
    socket.on("user:offline", onOffline);
    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onNew);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("conversation:read", onRead);
      socket.off("user:online", onOnline);
      socket.off("user:offline", onOffline);
    };
  }, [socket, conversationId, currentUser.id, loadLatest]);

  const deliver = useCallback(
    (content: string, clientMsgId: string) => {
      if (!conversationId) return;
      const settle = (saved?: ChatMessage, error?: string) => {
        if (saved) setMessages((current) => mergeMessages(current, [saved]));
        else
          setMessages((current) =>
            current.map((m) => (m.clientMsgId === clientMsgId && m.pending ? { ...m, pending: false, failed: true } : m))
          );
        return error;
      };
      if (socket?.connected) {
        socket
          .timeout(ACK_TIMEOUT_MS)
          .emit(
            "message:send",
            { conversationId, content, clientMsgId },
            (err: Error | null, res?: { message?: ChatMessage; error?: string }) => settle(err ? undefined : res?.message)
          );
        return;
      }
      // No live connection: the REST API saves it the same way (same clientMsgId, same seq rules).
      fetch(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, clientMsgId }),
      })
        .then((res) => res.json().then((data) => settle(res.ok ? data.message : undefined)))
        .catch(() => settle());
    },
    [conversationId, socket]
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!conversationId || !content) return;
      const clientMsgId = crypto.randomUUID();
      const pending: ChatMessage = {
        id: `pending:${clientMsgId}`,
        seq: 0,
        conversationId,
        senderId: currentUser.id,
        clientMsgId,
        content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        sender: { id: currentUser.id, name: currentUser.name },
        pending: true,
      };
      setMessages((current) => mergeMessages(current, [pending]));
      deliver(content, clientMsgId);
    },
    [conversationId, currentUser.id, currentUser.name, deliver]
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.clientMsgId) return;
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)));
      deliver(message.content, message.clientMsgId);
    },
    [deliver]
  );

  const loadEarlier = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.pending && !m.failed);
    if (!conversationId || !oldest) return;
    setLoadingEarlier(true);
    try {
      const data = await getJson(`/api/v1/chat/conversations/${conversationId}/messages?before=${oldest.seq}`);
      setMessages((current) => mergeMessages(current, data.messages ?? []));
      setHasEarlier(!!data.hasMore);
    } finally {
      setLoadingEarlier(false);
    }
  }, [conversationId]);

  const markHidden = useCallback((messageId: string) => {
    setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)));
  }, []);

  return {
    messages,
    loading,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
    typing,
    online,
    othersReadSeq,
    connected,
    send,
    retry,
    markHidden,
  };
}
