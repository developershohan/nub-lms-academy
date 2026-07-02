import Link from "next/link";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
};

export async function SiteHeader() {
  const session = await auth();
  const dashboardHref = session?.user.roles?.map((r) => ROLE_HOME[r]).find(Boolean) ?? "/student/dashboard";

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          NUB Academy
        </Link>
        <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
          <Link href="/courses">Courses</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session?.user ? (
            <UserMenu
              name={session.user.name}
              email={session.user.email}
              image={session.user.image}
              dashboardHref={dashboardHref}
            />
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
