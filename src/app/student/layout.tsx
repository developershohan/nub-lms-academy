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
  // Any active account may use the learner area: what each page shows is gated per course by
  // canAccessCourse, and admins (reviewing a course before approval) and teachers (previewing
  // their own) need the learn page without holding the STUDENT role.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { notifications, unreadCount } = await getNotificationBellProps(user.id);
  return (
    <DashboardShell title="Student" navItems={NAV} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </DashboardShell>
  );
}
