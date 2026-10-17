import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationBellProps } from "@/server/services/notification-service";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/dashboard-shell";

const NAV: DashboardNavItem[] = [
  { href: "/student/dashboard", label: "Overview", icon: "overview" },
  { href: "/student/my-courses", label: "My Courses", icon: "courses", activeFor: ["/student/course", "/student/quiz"] },
  { href: "/student/wishlist", label: "Wishlist", icon: "wishlist" },
  { href: "/student/certificates", label: "Certificates", icon: "certificates" },
  { href: "/student/messages", label: "Messages", icon: "messages" },
  { href: "/student/billing", label: "Billing", icon: "billing" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // Any active account may use the learner area: what each page shows is gated per course by
  // canAccessCourse, and admins (reviewing a course before approval) and teachers (previewing
  // their own) need the learn page without holding the STUDENT role.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { notifications, unreadCount } = await getNotificationBellProps(user.id);
  return (
    <DashboardShell
      title="Student"
      navItems={NAV}
      user={user}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </DashboardShell>
  );
}
