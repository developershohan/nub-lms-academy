import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const FULL_ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/teachers", label: "Teacher Applications" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/certificates", label: "Certificates" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

// SUPPORT staff only ever reach /admin/messages (enforced per-page by requireChatModerator) - a
// full admin nav sidebar would otherwise show them ten links that all redirect to /login.
const SUPPORT_NAV = [{ href: "/admin/messages", label: "Messages" }];

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
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </DashboardShell>
  );
}
