import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import type { RoleName } from "@/generated/prisma/client";

/** Thrown from authorize() when credentials are correct but the email isn't verified yet - kept
 * distinct from a plain wrong-password failure so the login form can offer a "resend
 * verification email" action instead of just "invalid credentials". */
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
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
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        // Same generic failure for "no such user" and "wrong password" -
        // never reveal which one it was.
        if (!user?.passwordHash) return null;
        if (user.status !== "ACTIVE") return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (!user.emailVerified) throw new EmailNotVerifiedError();

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
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
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.status = token.status;
      session.user.roles = token.roles;
      return session;
    },
  },
});
