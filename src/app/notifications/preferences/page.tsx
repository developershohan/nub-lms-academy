import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationPreferences } from "@/server/services/notification-service";
import { categoriesForRoles } from "@/lib/notification-categories";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";

export const metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/notifications/preferences");
  const visible = new Set(categoriesForRoles(user.roles));
  const preferences = (await getNotificationPreferences(user.id)).filter((p) => visible.has(p.category));

  return (
    <div className="space-y-6">
      <Link href="/notifications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Notifications
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Notification preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what shows up in the app and what is also emailed to {user.email}.
        </p>
      </div>
      <NotificationPreferencesForm
        preferences={preferences.map(({ category, label, description, inApp, email, emailAvailable, inAppLocked }) => ({
          category,
          label,
          description,
          inApp,
          email,
          emailAvailable,
          inAppLocked,
        }))}
      />
    </div>
  );
}
