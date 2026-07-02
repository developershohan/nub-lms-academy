import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/student/dashboard", label: "Overview" },
  { href: "/student/my-courses", label: "My Courses" },
  { href: "/student/wishlist", label: "Wishlist" },
  { href: "/student/certificates", label: "Certificates" },
  { href: "/student/messages", label: "Messages" },
  { href: "/student/billing", label: "Billing" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("STUDENT") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/login");
  }
  const { notifications, unreadCount } = await getNotificationBellProps(user.id);
  return (
    <DashboardShell title="Student" navItems={NAV} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}
