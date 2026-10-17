import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";

const FULL_ADMIN_NAV: DashboardNavItem[] = [
  { href: "/admin/dashboard", label: "Overview", icon: "overview" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/teachers", label: "Teacher Applications", icon: "teachers" },
  { href: "/admin/courses", label: "Courses", icon: "courses" },
  { href: "/admin/categories", label: "Categories", icon: "categories" },
  { href: "/admin/reviews", label: "Reviews", icon: "reviews" },
  { href: "/admin/certificates", label: "Certificates", icon: "certificates" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/coupons", label: "Coupons", icon: "coupons" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "subscriptions" },
  { href: "/admin/messages", label: "Messages", icon: "messages" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "audit" },
];

// SUPPORT staff only ever reach /admin/messages (enforced per-page by requireChatModerator) - a
// full admin nav sidebar would otherwise show them ten links that all redirect to /login.
const SUPPORT_NAV: DashboardNavItem[] = [{ href: "/admin/messages", label: "Messages", icon: "messages" }];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isFullAdmin = !!user && (user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN"));
  const isSupport = !!user && user.roles.includes("SUPPORT");
  if (!isFullAdmin && !isSupport) redirect("/login");

  const { notifications, unreadCount } = await getNotificationBellProps(user!.id);
  return (
    <DashboardShell
      title="Admin"
      navItems={isFullAdmin ? FULL_ADMIN_NAV : SUPPORT_NAV}
      user={user!}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </DashboardShell>
  );
}
