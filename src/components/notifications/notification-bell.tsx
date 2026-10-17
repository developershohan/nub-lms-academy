"use client";

import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/components/notifications/actions";
import { collapsedCount, useLiveNotifications } from "@/components/notifications/use-live-notifications";
import { formatRelativeTime } from "@/lib/format";
import type { PushedNotification } from "@/server/notifications/notify";
import { cn } from "@/lib/utils";

const BELL_LIMIT = 8;

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: PushedNotification[];
  initialUnreadCount: number;
}) {
  const { notifications, setNotifications, unreadCount, setUnreadCount } = useLiveNotifications(
    initialNotifications,
    initialUnreadCount,
    { limit: BELL_LIMIT, toastNew: true }
  );

  async function handleOpenNotification(notification: PushedNotification) {
    if (notification.status !== "UNREAD") return;
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, status: "READ" } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationReadAction(notification.id);
    } catch {
      // A link into another dashboard unmounts this bell mid-navigation and aborts the request -
      // marking read is best effort and must never surface as an unhandled rejection.
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "READ" })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          />
        }
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs font-normal text-muted-foreground underline">
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {notifications.map((n) => {
          const count = collapsedCount(n);
          return (
            <DropdownMenuItem
              key={n.id}
              onClick={() => handleOpenNotification(n)}
              render={n.link ? <Link href={n.link} /> : undefined}
            >
              <div className="flex w-full gap-2">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.status === "UNREAD" ? "bg-primary" : "bg-transparent")}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className={cn("text-sm", n.status === "UNREAD" && "font-medium")}>
                    {n.title}
                    {count && <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>}
                  </p>
                  {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {formatRelativeTime(new Date(n.createdAt))}
                  </p>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <Link href="/notifications" className="font-medium text-primary hover:underline">
            View all
          </Link>
          <Link
            href="/notifications/preferences"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" aria-hidden />
            Preferences
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
