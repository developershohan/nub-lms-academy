import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { NOTIFICATION_CATEGORIES, categoriesForRoles } from "@/lib/notification-categories";
import { countUnreadNotifications, listNotificationsForUser, type NotificationTab } from "@/server/services/notification-service";
import { NotificationList } from "@/components/notifications/notification-list";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/notifications");
  const params = await searchParams;
  const categories = categoriesForRoles(user.roles);
  const tabs: { key: NotificationTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    ...categories.map((key) => ({ key, label: NOTIFICATION_CATEGORIES[key].label })),
  ];
  const requested = params.filter === "unread" ? "unread" : params.tab;
  const tab = tabs.find((t) => t.key === requested)?.key ?? "all";

  const [page, unreadCount] = await Promise.all([listNotificationsForUser(user.id, { tab }), countUnreadNotifications(user.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Inbox</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
        </div>
        <Link href="/notifications/preferences" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Settings className="size-4" aria-hidden />
          Preferences
        </Link>
      </div>
      <nav aria-label="Filter notifications" className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/notifications" : `/notifications?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              t.key === tab && "bg-muted text-foreground"
            )}
          >
            {t.label}
            {t.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Link>
        ))}
      </nav>
      <NotificationList key={tab} tab={tab} initialNotifications={page.notifications} initialHasMore={page.hasMore} initialUnreadCount={unreadCount} />
    </div>
  );
}
