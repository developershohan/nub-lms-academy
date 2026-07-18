import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getRoleHome } from "@/lib/role-home";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";

// Not role-gated like /student, /teacher, /admin - any authenticated active user has a profile,
// regardless of which role dashboard they otherwise land on.
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Link href={getRoleHome(user.roles)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-6">{children}</main>
    </div>
  );
}
