import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";

// ponytail: students/revenue/settings land here once their models ship in later phases.
const NAV: DashboardNavItem[] = [
  { href: "/teacher/dashboard", label: "Overview", icon: "overview" },
  { href: "/teacher/courses", label: "Courses", icon: "courses" },
  { href: "/teacher/messages", label: "Messages", icon: "messages" },
];

export default async function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("TEACHER") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/teacher/apply");
  }
  const { notifications, unreadCount } = await getNotificationBellProps(user.id);
  return (
    <DashboardShell
      title="Teacher"
      navItems={NAV}
      user={user}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </DashboardShell>
  );
}
