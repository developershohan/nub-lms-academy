"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
};

export function SiteHeader() {
  const { data: session, status } = useSession();
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
          {status === "authenticated" ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
                <Avatar className="size-8">
                  <AvatarImage src={session.user.image ?? undefined} />
                  <AvatarFallback>{session.user.name?.[0] ?? session.user.email?.[0]}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={dashboardHref} />}>Dashboard</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
