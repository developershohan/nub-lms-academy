import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getNotificationPreferences } from "@/server/services/notification-service";
import { categoriesForRoles } from "@/lib/notification-categories";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { PushSetup } from "@/components/notifications/push-setup";

export const metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/notifications/preferences");
  const visible = new Set(categoriesForRoles(user.roles));
  const preferences = (await getNotificationPreferences(user.id)).filter((p) => visible.has(p.category));
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? null;

  return (
    <div className="space-y-6">
      <Link href="/notifications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Notifications
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Notification preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what shows up in the app, what is emailed to {user.email}, and what reaches this device as a push notification.
        </p>
      </div>
      <PushSetup vapidPublicKey={vapidPublicKey} />
      <NotificationPreferencesForm
        pushAvailable={!!vapidPublicKey}
        preferences={preferences.map(({ category, label, description, inApp, email, push, emailAvailable, emailTiming, inAppLocked }) => ({
          category,
          label,
          description,
          inApp,
          email,
          push,
          emailAvailable,
          emailTiming,
          inAppLocked,
        }))}
      />
    </div>
  );
}
