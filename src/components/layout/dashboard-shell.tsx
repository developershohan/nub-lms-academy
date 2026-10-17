"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CreditCard,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Receipt,
  Repeat,
  ScrollText,
  Shapes,
  Star,
  TicketPercent,
  Users,
} from "lucide-react";
import type { RoleName } from "@/generated/prisma/client";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { isUnder } from "@/lib/role-home";
import { cn } from "@/lib/utils";

// Layouts are server components, so they name an icon rather than pass the component itself.
const NAV_ICONS = {
  overview: LayoutDashboard,
  courses: BookOpen,
  wishlist: Heart,
  certificates: Award,
  messages: MessagesSquare,
  billing: CreditCard,
  users: Users,
  teachers: GraduationCap,
  categories: Shapes,
  reviews: Star,
  orders: Receipt,
  coupons: TicketPercent,
  subscriptions: Repeat,
  audit: ScrollText,
};

export type DashboardNavItem = {
  href: string;
  label: string;
  icon?: keyof typeof NAV_ICONS;
  /** Other paths this item owns, e.g. My Courses stays highlighted inside a course's player. */
  activeFor?: string[];
};

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
};

type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
  roles: RoleName[];
};

export function DashboardShell({
  title,
  navItems,
  user,
  notifications = [],
  unreadCount = 0,
  children,
}: {
  title: string;
  navItems: DashboardNavItem[];
  user: ShellUser;
  notifications?: NotificationItem[];
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar sm:flex">
        <DashboardNav title={title} navItems={navItems} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Not sticky: pages under the shell (the quiz timer, the learning player) pin their own bars to the top. */}
        <header className="flex h-14 items-center gap-2 border-b px-3 sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-lg" className="-ml-1 sm:hidden" aria-label="Open navigation" />}
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="gap-0 bg-sidebar">
              <SheetTitle className="sr-only">{title} navigation</SheetTitle>
              <DashboardNav
                title={title}
                navItems={navItems}
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <Link
            href={navItems[0]?.href ?? "/"}
            className="flex min-w-0 items-baseline gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:hidden"
          >
            <span className="truncate font-heading text-[15px] font-semibold tracking-tight">NUB Academy</span>
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{title}</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell initialNotifications={notifications} initialUnreadCount={unreadCount} />
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} image={user.image} roles={user.roles} />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Sidebar contents, shared by the desktop rail and the phone sheet. */
function DashboardNav({
  title,
  navItems,
  pathname,
  onNavigate,
}: {
  title: string;
  navItems: DashboardNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="rounded-sm font-heading text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          NUB Academy
        </Link>
        <p className="mt-1 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          {title} dashboard
        </p>
      </div>

      <nav aria-label={`${title} dashboard`} className="flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = [item.href, ...(item.activeFor ?? [])].some((href) => isUnder(pathname, href));
            const Icon = item.icon ? NAV_ICONS[item.icon] : null;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:py-2",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-amber" aria-hidden />}
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to site
        </Link>
      </div>
    </div>
  );
}
