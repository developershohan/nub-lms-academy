import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { countUnreadNotifications, listNotificationsForUser } from "@/server/services/notification-service";
import { NotificationList } from "@/components/notifications/notification-list";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/notifications");
  const unreadOnly = (await searchParams).filter === "unread";

  const [page, unreadCount] = await Promise.all([
    listNotificationsForUser(user.id, { unreadOnly }),
    countUnreadNotifications(user.id),
  ]);

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Inbox</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
        </div>
        <Link
          href="/notifications/preferences"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings className="size-4" aria-hidden />
          Preferences
        </Link>
      </div>
      <nav aria-label="Filter notifications" className="flex gap-1">
        {tab("/notifications", "All", !unreadOnly)}
        {tab("/notifications?filter=unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`, unreadOnly)}
      </nav>
      <NotificationList
        key={unreadOnly ? "unread" : "all"}
        initialNotifications={page.notifications}
        initialHasMore={page.hasMore}
        initialUnreadCount={unreadCount}
        unreadOnly={unreadOnly}
      />
    </div>
  );
}
