"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, EmailNotVerifiedError, RateLimitedError } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { resolveLoginDestination } from "@/lib/role-home";
import { resendVerificationEmail } from "@/server/services/auth-service";
import { redirectAuthenticatedUser } from "@/lib/permissions";

export type LoginState = { error?: string; unverifiedEmail?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  await redirectAuthenticatedUser();

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    // redirect: false - we decide the destination below based on the signed-in user's own
    // roles, rather than blindly honoring a callbackUrl meant for a different role's dashboard.
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many sign-in attempts. Try again in 15 minutes." };
    }
    if (error instanceof EmailNotVerifiedError) {
      return { error: "Please verify your email before logging in.", unverifiedEmail: parsed.data.email };
    }
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error;
  }

  // Case-insensitive so accounts registered before emails were lowercased land on the right home.
  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    include: { roles: { include: { role: true } } },
  });
  const roles = user?.roles.map((r) => r.role.name) ?? [];
  const callbackUrl = formData.get("callbackUrl") as string | null;
  redirect(resolveLoginDestination(roles, callbackUrl));
}

export async function signInWithGoogleAction() {
  await redirectAuthenticatedUser();
  await signIn("google");
}

export async function signInWithGitHubAction() {
  await redirectAuthenticatedUser();
  await signIn("github");
}

export async function resendVerificationAction(email: string) {
  await resendVerificationEmail(email, { ip: clientIp(await headers()) });
}
