import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getUserProfile } from "@/server/services/user-service";
import { ProfileForm } from "@/components/profile/profile-form";
import { EmailForm } from "@/components/profile/email-form";
import { PasswordForm } from "@/components/profile/password-form";
import { VerificationBanner } from "@/components/profile/verification-banner";
import { TwoFactorBanner } from "@/components/profile/two-factor-banner";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile) redirect("/login");

  const hasPassword = !!profile.passwordHash;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>

      {!profile.emailVerified && <VerificationBanner />}
      <TwoFactorBanner />

      <ProfileForm name={profile.name} phone={profile.phone} address={profile.address} />

      {hasPassword ? (
        <>
          <EmailForm email={profile.email} />
          <PasswordForm />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Email and password are managed by the account you signed in with (Google/GitHub).
        </p>
      )}
    </div>
  );
}
