import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/teachers", label: "Teacher Applications" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/certificates", label: "Certificates" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/coupons", label: "Coupons" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN"))) {
    redirect("/login");
  }
  return (
    <DashboardShell title="Admin" navItems={NAV}>
      {children}
    </DashboardShell>
  );
}
