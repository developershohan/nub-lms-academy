"use client";

// The header's unread-messages total. Loaded once per tab, then kept current by the
// conversation:updated events every member receives (unread = lastSeq - lastReadSeq).
import { useEffect, useSyncExternalStore } from "react";
import type { Socket } from "socket.io-client";

type UnreadState = { counts: Record<string, number>; muted: Set<string> };

let state: UnreadState = { counts: {}, muted: new Set() };
let total = 0;
const listeners = new Set<() => void>();
const wired = new WeakSet<Socket>();

function set(next: UnreadState) {
  state = next;
  total = Object.entries(next.counts).reduce((sum, [id, n]) => (next.muted.has(id) ? sum : sum + n), 0);
  listeners.forEach((l) => l());
}

async function load() {
  try {
    const res = await fetch("/api/v1/chat/unread", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: Record<string, number>; muted: string[] };
    set({ counts: data.conversations ?? {}, muted: new Set(data.muted ?? []) });
  } catch {
    // Offline - the next reconnect reloads it.
  }
}

function wire(socket: Socket) {
  if (wired.has(socket)) return;
  wired.add(socket);
  socket.on("conversation:updated", (update: { conversationId: string; unread?: number; mutedUntil?: string | null }) => {
    if (update.unread === undefined && update.mutedUntil === undefined) return;
    const counts = { ...state.counts };
    const muted = new Set(state.muted);
    if (update.unread !== undefined) counts[update.conversationId] = update.unread;
    if (update.mutedUntil !== undefined) {
      if (update.mutedUntil && new Date(update.mutedUntil).getTime() > Date.now()) muted.add(update.conversationId);
      else muted.delete(update.conversationId);
    }
    set({ counts, muted });
  });
  socket.on("conversation:removed", ({ conversationId }: { conversationId: string }) => {
    const counts = { ...state.counts };
    delete counts[conversationId];
    set({ counts, muted: state.muted });
  });
  // Anything missed while disconnected.
  socket.on("connect", () => void load());
  void load();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useUnreadTotal(socket: Socket | null) {
  useEffect(() => {
    if (socket) wire(socket);
  }, [socket]);
  return useSyncExternalStore(subscribe, () => total, () => 0);
}
