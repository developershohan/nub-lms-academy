import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/login");
  }
  const { notifications, unreadCount } = await getNotificationBellProps(user.id);
  return (
    <DashboardShell title="Admin" navItems={NAV} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}
