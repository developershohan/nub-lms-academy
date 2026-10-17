"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Check, GraduationCap, LayoutDashboard, LogOut, Presentation, ShieldCheck, UserRound } from "lucide-react";
import type { RoleName } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDashboardKey, getRoleDashboards, getRoleHome, type RoleDashboard } from "@/lib/role-home";

const DASHBOARD_ICONS: Record<RoleDashboard["key"], typeof LayoutDashboard> = {
  student: GraduationCap,
  teacher: Presentation,
  admin: ShieldCheck,
};

export function UserMenu({
  name,
  email,
  image,
  roles,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles: RoleName[];
}) {
  const pathname = usePathname();
  const dashboards = getRoleDashboards(roles);
  const currentDashboard = getDashboardKey(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />}
      >
        <Avatar className="size-8">
          <AvatarImage src={image ?? undefined} alt="" />
          <AvatarFallback>{(name?.trim()[0] ?? email?.[0] ?? "?").toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="py-1.5">
            <span className="block truncate text-sm font-medium text-foreground">{name ?? "Your account"}</span>
            {email && <span className="block truncate text-xs font-normal">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {dashboards.length > 1 ? (
          // Multi-role users (a teacher who also studies, an admin who teaches) jump between their
          // dashboards from here instead of editing the URL.
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[10px] tracking-widest uppercase">
              Switch dashboard
            </DropdownMenuLabel>
            {dashboards.map((dashboard) => {
              const Icon = DASHBOARD_ICONS[dashboard.key];
              const current = dashboard.key === currentDashboard;
              return (
                <DropdownMenuItem
                  key={dashboard.key}
                  render={<Link href={dashboard.href} aria-current={current ? "page" : undefined} />}
                >
                  <Icon />
                  {dashboard.label}
                  {current && <Check className="ml-auto" aria-hidden />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuItem render={<Link href={getRoleHome(roles)} />}>
            <LayoutDashboard />
            Dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserRound />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
