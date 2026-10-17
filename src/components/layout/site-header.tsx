import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileSiteNav, SiteNavLinks, type SiteNavLink } from "@/components/layout/site-nav";
import { Button } from "@/components/ui/button";
import { getRoleHome } from "@/lib/role-home";

export async function SiteHeader() {
  // DB-verified roles, not the JWT's cached claim - so a just-approved teacher's header link
  // points at /teacher/dashboard immediately instead of only after they log back in.
  const user = await getCurrentUser();
  const links: SiteNavLink[] = [
    { href: "/courses", label: "Courses" },
    { href: "/categories", label: "Categories" },
    { href: "/pricing", label: "Pricing" },
    { href: "/about", label: "About" },
    ...(!user?.roles.includes("TEACHER") ? [{ href: "/teacher/apply", label: "Become a teacher" }] : []),
  ];

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <MobileSiteNav links={links} dashboardHref={user ? getRoleHome(user.roles) : null} />
        <Link
          href="/"
          className="mr-2 rounded-sm font-heading text-[15px] font-semibold tracking-tight whitespace-nowrap md:mr-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          NUB Academy
        </Link>
        <SiteNavLinks links={links} />
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <UserMenu name={user.name} email={user.email} image={user.image} roles={user.roles} />
          ) : (
            <>
              <Button variant="ghost" className="hidden min-[360px]:inline-flex" render={<Link href="/login" />}>
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
