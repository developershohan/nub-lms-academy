"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
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

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
};

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
}) {
  const { socket } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      fetch("/api/v1/notifications")
        .then((res) => res.json())
        .then((data) => {
          setNotifications(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        });
      // Whatever triggered this notification (a role change, a new application, a payment...)
      // likely changed data on the page the user is currently looking at too - re-render it with
      // fresh server data instead of making them hit refresh themselves.
      router.refresh();
    };
    socket.on("notification:new", refresh);
    return () => {
      socket.off("notification:new", refresh);
    };
  }, [socket, router]);

  async function handleOpenNotification(notification: NotificationItem) {
    if (notification.status === "UNREAD") {
      try {
        await markNotificationReadAction(notification.id);
        setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, status: "READ" } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Clicking a notification whose link points outside the current role area (e.g. a
        // student approved as teacher, linked to /teacher/dashboard) unmounts this component
        // mid-navigation, aborting this request - marking read is best-effort, not required for
        // the navigation itself, so a failure here must never surface as an unhandled rejection
        // (which Next's dev overlay - and potentially an error boundary - would otherwise show).
      }
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "READ" })));
    setUnreadCount(0);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="relative" />}>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
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
        {notifications.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => handleOpenNotification(n)}
            render={n.link ? <Link href={n.link} /> : undefined}
          >
            <div className="w-full space-y-0.5">
              <p className={n.status === "UNREAD" ? "font-medium" : ""}>{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
