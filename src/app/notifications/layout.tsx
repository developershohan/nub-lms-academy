import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getRoleHome } from "@/lib/role-home";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";

// Like /profile: every signed-in user has notifications, whichever dashboard they use.
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/notifications");

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Link
          href={getRoleHome(user.roles)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl p-4 outline-none sm:p-6">
        {children}
      </main>
    </div>
  );
}
