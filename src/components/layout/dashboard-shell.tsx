"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };
type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
};

export function DashboardShell({
  title,
  navItems,
  notifications = [],
  unreadCount = 0,
  children,
}: {
  title: string;
  navItems: NavItem[];
  notifications?: NotificationItem[];
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r p-4 sm:block">
        <div className="mb-6 px-2 font-semibold">{title}</div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm",
                pathname === item.href
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-semibold sm:hidden">{title}</span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell initialNotifications={notifications} initialUnreadCount={unreadCount} />
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
              Log out
            </Button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
