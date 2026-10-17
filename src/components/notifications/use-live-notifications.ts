"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSocket } from "@/hooks/use-socket";
import { categoryOf } from "@/lib/notification-categories";
import type { PushedNotification } from "@/server/notifications/notify";

type NewPayload = { notification: PushedNotification; unreadCount: number; refreshPage?: boolean };
type ReadPayload = { ids?: string[]; all?: boolean; groupKey?: string; unreadCount: number | null };

/**
 * A list of notifications kept live from the socket: new ones arrive with their full content (a
 * collapsed one replaces its earlier copy), and reads from any tab clear them here too. Shared by
 * the bell and the /notifications page.
 */
export function useLiveNotifications(
  initial: PushedNotification[],
  initialUnreadCount: number,
  {
    limit,
    toastNew = false,
    unreadOnly = false,
    accept,
  }: { limit?: number; toastNew?: boolean; unreadOnly?: boolean; accept?: (notification: PushedNotification) => boolean } = {}
) {
  const { socket } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    if (!socket) return;
    const onNew = ({ notification, unreadCount, refreshPage }: NewPayload) => {
      // A category tab only lists its own kind; the count is for everything.
      if (accept && !accept(notification)) {
        setUnreadCount(unreadCount);
        return;
      }
      setNotifications((current) => {
        const next = [notification, ...current.filter((n) => n.id !== notification.id)];
        return limit ? next.slice(0, limit) : next;
      });
      setUnreadCount(unreadCount);
      // Chat has its own live inbox; anything else that needs you gets a toast.
      if (toastNew && categoryOf(notification.type) !== "messages") {
        toast(notification.title, {
          description: notification.body ?? undefined,
          action: notification.link ? { label: "Open", onClick: () => router.push(notification.link!) } : undefined,
        });
      }
      // Only for changes the current page shows (a new role, an approved course) - not chat.
      if (refreshPage) router.refresh();
    };
    const onRead = ({ ids, all, groupKey, unreadCount }: ReadPayload) => {
      const isRead = (n: PushedNotification) => all || ids?.includes(n.id) || (!!groupKey && n.groupKey === groupKey);
      setNotifications((current) =>
        unreadOnly ? current.filter((n) => !isRead(n)) : current.map((n) => (isRead(n) ? { ...n, status: "READ" } : n))
      );
      if (unreadCount != null) setUnreadCount(unreadCount);
    };
    socket.on("notification:new", onNew);
    socket.on("notification:read", onRead);
    return () => {
      socket.off("notification:new", onNew);
      socket.off("notification:read", onRead);
    };
  }, [socket, router, limit, toastNew, unreadOnly, accept]);

  return { notifications, setNotifications, unreadCount, setUnreadCount };
}

/** "3 new" for a collapsed notification, nothing for a single one. */
export function collapsedCount(notification: PushedNotification) {
  const count = Number((notification.data as { count?: number } | null)?.count ?? 1);
  return count > 1 ? count : null;
}
