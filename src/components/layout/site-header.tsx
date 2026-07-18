import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { getRoleHome } from "@/lib/role-home";

export async function SiteHeader() {
  // DB-verified roles, not the JWT's cached claim - so a just-approved teacher's header link
  // points at /teacher/dashboard immediately instead of only after they log back in.
  const user = await getCurrentUser();
  const dashboardHref = user ? getRoleHome(user.roles) : "/student/dashboard";

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          NUB Academy
        </Link>
        <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
          <Link href="/courses">Courses</Link>
          <Link href="/pricing">Pricing</Link>
          {!user?.roles.includes("TEACHER") && <Link href="/teacher/apply">Become a teacher</Link>}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <UserMenu name={user.name} email={user.email} image={user.image} dashboardHref={dashboardHref} />
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Log in
              </Button>
              <Button render={<Link href="/register" />}>Sign up</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
