"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/components/notifications/actions";
import { collapsedCount, useLiveNotifications } from "@/components/notifications/use-live-notifications";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { categoryOf } from "@/lib/notification-categories";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PushedNotification } from "@/server/notifications/notify";

/** The full notification history, live: new ones appear at the top as they arrive. `tab` is
 * "all", "unread" or a category; live arrivals are shown only when they belong on it. */
export function NotificationList({
  tab,
  initialNotifications,
  initialHasMore,
  initialUnreadCount,
}: {
  tab: string;
  initialNotifications: PushedNotification[];
  initialHasMore: boolean;
  initialUnreadCount: number;
}) {
  const unreadOnly = tab === "unread";
  const { notifications, setNotifications, unreadCount, setUnreadCount } = useLiveNotifications(initialNotifications, initialUnreadCount, {
    unreadOnly,
    accept: (n) => tab === "all" || unreadOnly || categoryOf(n.type) === tab,
  });
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    const oldest = notifications[notifications.length - 1];
    if (!oldest) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/notifications?before=${encodeURIComponent(oldest.id)}&tab=${encodeURIComponent(tab)}`);
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not load more notifications");
      setNotifications((current) => [...current, ...data.notifications.filter((n: PushedNotification) => !current.some((c) => c.id === n.id))]);
      setHasMore(!!data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  async function open(notification: PushedNotification) {
    if (notification.status !== "UNREAD") return;
    setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, status: "READ" } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    await markNotificationReadAction(notification.id).catch(() => undefined);
  }

  async function markAll() {
    setNotifications((current) => (unreadOnly ? [] : current.map((n) => ({ ...n, status: "READ" }))));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={unreadOnly ? "You're all caught up" : "Nothing here yet"}
        description="Messages, course updates and payments will show up here as they happen."
      />
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll}>
            Mark all as read
          </Button>
        </div>
      )}
      <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {notifications.map((n) => {
          const count = collapsedCount(n);
          const content = (
            <div className="flex gap-3 p-4">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.status === "UNREAD" ? "bg-primary" : "bg-transparent")} aria-hidden />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={cn("text-sm", n.status === "UNREAD" && "font-semibold")}>
                  {n.status === "UNREAD" && <span className="sr-only">Unread: </span>}
                  {n.title}
                  {count && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({count})</span>}
                </p>
                {n.body && <p className="line-clamp-3 text-sm text-muted-foreground">{n.body}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                {formatRelativeTime(new Date(n.createdAt))}
              </span>
            </div>
          );
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={() => open(n)} className="block outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => open(n)} className="block w-full text-left hover:bg-muted/50">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load older notifications"}
          </Button>
        </div>
      )}
    </div>
  );
}
