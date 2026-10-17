"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isUnder } from "@/lib/role-home";
import { cn } from "@/lib/utils";

export type SiteNavLink = { href: string; label: string };

/** The header's inline links, from md up. */
export function SiteNavLinks({ links }: { links: SiteNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-5 text-sm">
        {links.map((link) => {
          const active = isUnder(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm whitespace-nowrap underline-offset-[6px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "font-medium text-foreground underline decoration-amber decoration-2"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Below md the links move into a sheet behind a menu button. */
export function MobileSiteNav({
  links,
  dashboardHref,
}: {
  links: SiteNavLink[];
  /** Signed-in visitors get a dashboard shortcut; signed-out ones get log in / sign up. */
  dashboardHref: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-lg" className="-ml-2 md:hidden" aria-label="Open menu" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="gap-0 bg-sidebar">
        <div className="px-5 pt-5 pb-4">
          <SheetTitle className="font-heading text-[15px] font-semibold tracking-tight">NUB Academy</SheetTitle>
          <p className="mt-1 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Menu</p>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {links.map((link) => {
              const active = isUnder(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex rounded-md px-3 py-2.5 text-[15px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground"
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-amber" aria-hidden />}
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <SheetFooter className="border-t">
          {dashboardHref ? (
            <Button size="lg" render={<Link href={dashboardHref} onClick={close} />}>
              <LayoutDashboard />
              My dashboard
            </Button>
          ) : (
            <>
              <Button size="lg" render={<Link href="/register" onClick={close} />}>
                Create a free account
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/login" onClick={close} />}>
                Log in
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
