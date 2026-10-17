"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import {
  deleteMessageAction,
  editMessageAction,
  reactToMessageAction,
} from "@/components/chat/actions";

export type ChatReaction = { emoji: string; count: number; userIds: string[] };

export type ChatReplyRef = { id: string; seq: number; senderName: string | null; preview: string; deleted: boolean };

export type ChatMessage = {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  clientMsgId: string | null;
  type: "TEXT" | "SYSTEM";
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  removedByModerator: boolean;
  sender: { id: string; name: string | null };
  replyTo: ChatReplyRef | null;
  reactions: ChatReaction[];
  /** Shown straight away, before the server has saved it. */
  pending?: boolean;
  /** Couldn't be sent - the bubble offers a retry with the same clientMsgId. */
  failed?: boolean;
};

const ACK_TIMEOUT_MS = 10_000;

/** Server rows have numbers; a pending message sorts after everything saved. */
const sortKey = (m: ChatMessage) => (m.pending || m.failed ? Number.MAX_SAFE_INTEGER : m.seq);

/** Adds or replaces by id (an edit or a reaction replaces the earlier copy), and swaps a pending
 * copy for the saved one with the same clientMsgId. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    if (message.clientMsgId) byId.delete(`pending:${message.clientMsgId}`);
    byId.set(message.id, message);
  }
  // A quoted message was edited or removed: the quotes in its replies follow.
  const quoted = new Map(incoming.filter((m) => !m.pending && !m.failed).map((m) => [m.id, m]));
  for (const [id, m] of byId) {
    const source = m.replyTo ? quoted.get(m.replyTo.id) : undefined;
    if (!source || !m.replyTo) continue;
    const deleted = !!source.deletedAt;
    const preview = deleted ? "" : source.content.slice(0, 140);
    if (m.replyTo.preview !== preview || m.replyTo.deleted !== deleted) byId.set(id, { ...m, replyTo: { ...m.replyTo, preview, deleted } });
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

type Ack<T> = (err: Error | null, res?: T & { error?: string }) => void;

/**
 * One open conversation: its messages, kept in seq order and live. Sends show at once (pending)
 * and are matched to the saved copy by clientMsgId, so a retry never posts twice. After a
 * reconnect the hook asks for only the messages after the newest it has (the "sync" gap, plus
 * anything edited or removed meanwhile), and it reports reads as "up to seq N" rather than per
 * message. Edits, removals and reactions go over the socket when it's up, else a server action.
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
  const [typing, setTyping] = useState<Map<string, string>>(new Map());
  const [online, setOnline] = useState<Set<string>>(new Set());
  /** How far the other members have read - a DM shows "Seen" under your last message from it. */
  const [othersReadSeq, setOthersReadSeq] = useState(0);
  const messagesRef = useRef(messages);
  const lastReadSent = useRef(0);
  const lastSyncAt = useRef<string | null>(null);

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
    lastSyncAt.current = new Date().toISOString();
    // Keep anything still pending; the page of saved messages replaces the rest.
    setMessages((current) => mergeMessages(current.filter((m) => m.pending || m.failed), data.messages ?? []));
    setHasEarlier(!!data.hasMore);
  }, [conversationId]);

  const join = useCallback(() => {
    if (!socket?.connected || !conversationId) return;
    socket.timeout(ACK_TIMEOUT_MS).emit("conversation:join", conversationId, (err: Error | null, res?: { online?: string[]; error?: string }) => {
      if (err || res?.error) return;
      if (res?.online) setOnline(new Set(res.online));
      // Only once the room is joined: the server ignores "viewing" for a room this socket isn't in,
      // and the join's access check makes it land after an immediately-sent "viewing".
      socket.emit("conversation:viewing", document.visibilityState === "visible" ? conversationId : null);
    });
  }, [socket, conversationId]);

  // Open a conversation: reset, join its room, load the newest page.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    lastReadSent.current = 0;
    lastSyncAt.current = null;
    queueMicrotask(() => {
      if (cancelled) return;
      setMessages([]);
      setTyping(new Map());
      setOnline(new Set());
      setOthersReadSeq(0);
      setLoading(true);
    });
    getJson(`/api/v1/chat/conversations/${conversationId}/messages`)
      .then((data) => {
        if (cancelled) return;
        lastSyncAt.current = new Date().toISOString();
        setMessages(data.messages ?? []);
        setHasEarlier(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    join();
    return () => {
      cancelled = true;
      socket?.emit("conversation:viewing", null);
      socket?.emit("conversation:leave", conversationId);
    };
  }, [conversationId, socket, join]);

  // Mark read whenever new messages land in the open, visible conversation.
  useEffect(() => {
    if (!loading) markRead();
  }, [messages, loading, markRead]);

  // "On screen" drives notifications: nobody gets an alert for the chat they're looking at.
  useEffect(() => {
    const onVisible = () => {
      markRead();
      if (socket?.connected && conversationId) {
        socket.emit("conversation:viewing", document.visibilityState === "visible" ? conversationId : null);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead, socket, conversationId]);

  // Live events for the open conversation.
  useEffect(() => {
    if (!socket || !conversationId) return;

    const sync = () => {
      const lastSeq = newestSeq(messagesRef.current);
      const since = lastSyncAt.current;
      const startedAt = new Date().toISOString();
      socket.timeout(ACK_TIMEOUT_MS).emit(
        "sync",
        { conversationId, lastSeq, since },
        (err: Error | null, res?: { messages?: ChatMessage[]; changed?: ChatMessage[]; reset?: boolean; error?: string }) => {
          if (err || !res || res.error || res.reset) {
            void loadLatest().catch(() => {});
            return;
          }
          lastSyncAt.current = startedAt;
          const incoming = [...(res.changed ?? []), ...(res.messages ?? [])];
          if (incoming.length) setMessages((current) => mergeMessages(current, incoming));
        }
      );
    };
    const onConnect = () => {
      // A reconnect is a new server-side socket in no rooms: re-join, then fetch only the gap -
      // unless Socket.IO's own recovery replayed everything already.
      join();
      if (!socket.recovered) sync();
    };
    const onNew = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) return;
      // A skipped number means something was missed (a dropped packet): fill the gap.
      if (message.seq > newestSeq(messagesRef.current) + 1 && messagesRef.current.length > 0) sync();
      setMessages((current) => mergeMessages(current, [message]));
    };
    const onUpdated = (message: ChatMessage) => {
      if (message.conversationId === conversationId) setMessages((current) => mergeMessages(current, [message]));
    };
    const onTypingStart = (p: { conversationId: string; userId: string; name: string | null }) => {
      if (p.conversationId === conversationId && p.userId !== currentUser.id) {
        setTyping((t) => new Map(t).set(p.userId, p.name ?? "Someone"));
      }
    };
    const onTypingStop = (p: { conversationId: string; userId: string }) => {
      if (p.conversationId === conversationId) {
        setTyping((t) => {
          if (!t.has(p.userId)) return t;
          const next = new Map(t);
          next.delete(p.userId);
          return next;
        });
      }
    };
    const onRead = (p: { conversationId: string; userId: string; lastReadSeq: number }) => {
      if (p.conversationId === conversationId && p.userId !== currentUser.id) {
        setOthersReadSeq((seq) => Math.max(seq, p.lastReadSeq));
      }
    };
    const onOnline = ({ userId }: { userId: string }) => setOnline((s) => (s.has(userId) ? s : new Set(s).add(userId)));
    const onOffline = ({ userId }: { userId: string }) =>
      setOnline((s) => {
        if (!s.has(userId)) return s;
        const next = new Set(s);
        next.delete(userId);
        return next;
      });
    // Someone stopped typing without saying so (closed the tab): expire them.
    const sweep = setInterval(() => setTyping((t) => (t.size ? new Map() : t)), 6_000);

    socket.on("connect", onConnect);
    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("conversation:read", onRead);
    socket.on("user:online", onOnline);
    socket.on("user:offline", onOffline);
    return () => {
      clearInterval(sweep);
      socket.off("connect", onConnect);
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("conversation:read", onRead);
      socket.off("user:online", onOnline);
      socket.off("user:offline", onOffline);
    };
  }, [socket, conversationId, currentUser.id, loadLatest, join]);

  const deliver = useCallback(
    (content: string, clientMsgId: string, replyToId: string | null) => {
      if (!conversationId) return;
      const settle = (saved?: ChatMessage, error?: string) => {
        if (saved) setMessages((current) => mergeMessages(current, [saved]));
        else {
          setMessages((current) =>
            current.map((m) => (m.clientMsgId === clientMsgId && m.pending ? { ...m, pending: false, failed: true } : m))
          );
          if (error) toast.error(error);
        }
      };
      if (socket?.connected) {
        socket
          .timeout(ACK_TIMEOUT_MS)
          .emit(
            "message:send",
            { conversationId, content, clientMsgId, replyToId },
            (err: Error | null, res?: { message?: ChatMessage; error?: string }) => settle(err ? undefined : res?.message, res?.error)
          );
        return;
      }
      // No live connection: the REST API saves it the same way (same clientMsgId, same seq rules).
      fetch(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, clientMsgId, replyToId }),
      })
        .then((res) => res.json().then((data) => settle(res.ok ? data.message : undefined, res.ok ? undefined : data.error)))
        .catch(() => settle());
    },
    [conversationId, socket]
  );

  const send = useCallback(
    (text: string, replyTo: ChatReplyRef | null = null) => {
      const content = text.trim();
      if (!conversationId || !content) return;
      const clientMsgId = crypto.randomUUID();
      const pending: ChatMessage = {
        id: `pending:${clientMsgId}`,
        seq: 0,
        conversationId,
        senderId: currentUser.id,
        clientMsgId,
        type: "TEXT",
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        removedByModerator: false,
        sender: { id: currentUser.id, name: currentUser.name },
        replyTo,
        reactions: [],
        pending: true,
      };
      setMessages((current) => mergeMessages(current, [pending]));
      deliver(content, clientMsgId, replyTo?.id ?? null);
    },
    [conversationId, currentUser.id, currentUser.name, deliver]
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.clientMsgId) return;
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)));
      deliver(message.content, message.clientMsgId, message.replyTo?.id ?? null);
    },
    [deliver]
  );

  const discard = useCallback((message: ChatMessage) => {
    setMessages((current) => current.filter((m) => m.id !== message.id));
  }, []);

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

  /** Socket when it's up (the room hears the change at once), a server action otherwise. */
  const change = useCallback(
    (event: "message:edit" | "message:delete" | "message:react", payload: object, fallback: () => Promise<{ error?: string } | { ok: true }>) => {
      const apply = (res?: { message?: ChatMessage; error?: string }) => {
        if (res?.error) toast.error(res.error);
        else if (res?.message) setMessages((current) => mergeMessages(current, [res.message!]));
      };
      if (socket?.connected) {
        (socket.timeout(ACK_TIMEOUT_MS).emit as (ev: string, p: object, ack: Ack<{ message?: ChatMessage }>) => void)(event, payload, (err, res) =>
          apply(err ? { error: "The server didn't answer - try again" } : res)
        );
        return;
      }
      void fallback().then((res) => apply("error" in res ? { error: res.error } : (res as { message?: ChatMessage })));
    },
    [socket]
  );

  const edit = useCallback(
    (messageId: string, content: string) => change("message:edit", { messageId, content }, () => editMessageAction(messageId, content)),
    [change]
  );
  const remove = useCallback(
    (messageId: string) => change("message:delete", { messageId }, () => deleteMessageAction(messageId)),
    [change]
  );
  const react = useCallback(
    (messageId: string, emoji: string) => change("message:react", { messageId, emoji }, () => reactToMessageAction(messageId, emoji)),
    [change]
  );

  const markHidden = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: "", reactions: [], removedByModerator: true } : m))
    );
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
    discard,
    edit,
    remove,
    react,
    markHidden,
  };
}
