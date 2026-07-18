"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, UserCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
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
        <Link
          href="/"
          className="mb-4 flex items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to site
        </Link>
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
          <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold sm:hidden">
            <ArrowLeft className="size-3.5" />
            {title}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell initialNotifications={notifications} initialUnreadCount={unreadCount} />
            <Button variant="ghost" size="icon" render={<Link href="/profile" />} aria-label="Profile">
              <UserCircle className="size-4" />
            </Button>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
