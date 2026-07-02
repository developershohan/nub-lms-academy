import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";

// ponytail: certificates/messages/billing/settings land here once their models ship in later phases.
const NAV = [
  { href: "/student/dashboard", label: "Overview" },
  { href: "/student/my-courses", label: "My Courses" },
  { href: "/student/wishlist", label: "Wishlist" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("STUDENT") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/login");
  }
  return (
    <DashboardShell title="Student" navItems={NAV}>
      {children}
    </DashboardShell>
  );
}
