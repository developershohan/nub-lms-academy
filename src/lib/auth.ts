import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { findUserByEmail } from "@/lib/user-by-email";
import { clientIp, limitAuthAttempt } from "@/lib/rate-limit";
import type { RoleName } from "@/generated/prisma/client";
import type { JWT } from "next-auth/jwt";

/** Thrown from authorize() when credentials are correct but the email isn't verified yet - kept
 * distinct from a plain wrong-password failure so the login form can offer a "resend
 * verification email" action instead of just "invalid credentials". */
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

/** Too many sign-in attempts for this account or IP (see AUTH_RATE_LIMITS.login). */
export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

async function assignDefaultRole(userId: string) {
  const studentRole = await prisma.role.upsert({
    where: { name: "STUDENT" },
    create: { name: "STUDENT" },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: studentRole.id } },
    create: { userId, roleId: studentRole.id },
    update: {},
  });
}

/** The credentials provider's authorize(), exported so its checks can be unit-tested. */
export async function authorizeCredentials(rawCredentials: unknown, request: Request) {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;

  // Checked here, not in the login action, so NextAuth's own credentials endpoint is covered
  // too - and before the user lookup and bcrypt, so a flood of guesses costs neither.
  const limit = await limitAuthAttempt("login", { email: parsed.data.email, ip: clientIp(request.headers) });
  if (limit.limited) throw new RateLimitedError();

  const user = await findUserByEmail(parsed.data.email);
  // Same generic failure for "no such user" and "wrong password" -
  // never reveal which one it was.
  if (!user?.passwordHash) return null;
  if (user.status !== "ACTIVE") return null;

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return null;

  if (!user.emailVerified) throw new EmailNotVerifiedError();

  return { id: user.id, email: user.email, name: user.name, image: user.image };
}

/**
 * Re-checks an existing session on every read, so a ban, password change or password reset (each
 * bumps User.sessionVersion) ends every session instead of letting a JWT live out its 30 days.
 * null = end the session (Auth.js then clears the cookie). Tokens issued before sessionVersion
 * existed count as version 0, so deploying this logs nobody out.
 */
export async function revalidateSessionToken(token: JWT): Promise<JWT | null> {
  if (!token.id) return token;
  try {
    const current = await prisma.user.findUnique({
      where: { id: token.id },
      select: { status: true, sessionVersion: true },
    });
    if (!current || current.status !== "ACTIVE") return null;
    if (current.sessionVersion !== (token.sessionVersion ?? 0)) return null;
    token.status = current.status;
  } catch (err) {
    // A database blip must not sign everyone out; the DB-backed checks in pages and services
    // (getCurrentUser, canAccessCourse, ...) still apply on their own.
    console.error("Session re-check failed:", err instanceof Error ? err.message : "unknown error");
  }
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await assignDefaultRole(user.id);
      // Only OAuth sign-ins reach this event (credentials registration inserts the user directly,
      // see auth-service.ts's registerUser) - the provider has already confirmed the email
      // address, so there's nothing for our own verification flow to add here.
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.id) return true;
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser && dbUser.status !== "ACTIVE") return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { roles: { include: { role: true } } },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.status = dbUser.status;
          token.roles = dbUser.roles.map((r) => r.role.name) as RoleName[];
          token.sessionVersion = dbUser.sessionVersion;
        }
        return token;
      }
      return revalidateSessionToken(token);
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.status = token.status;
      session.user.roles = token.roles;
      return session;
    },
  },
});
