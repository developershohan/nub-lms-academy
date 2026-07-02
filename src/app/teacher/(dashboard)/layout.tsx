import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";

// ponytail: students/messages/revenue/settings land here once their models ship in later phases.
const NAV = [
  { href: "/teacher/dashboard", label: "Overview" },
  { href: "/teacher/courses", label: "Courses" },
];

export default async function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("TEACHER") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/teacher/apply");
  }
  return (
    <DashboardShell title="Teacher" navItems={NAV}>
      {children}
    </DashboardShell>
  );
}
