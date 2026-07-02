import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { RoleName } from "@/generated/prisma/client";

const ROLE_PREFIXES: [string, RoleName][] = [
  ["/student", "STUDENT"],
  ["/teacher", "TEACHER"],
  ["/admin", "ADMIN"],
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const roles = req.auth?.user?.roles ?? [];
  const status = req.auth?.user?.status;

  function redirectToLogin() {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Any authenticated, active user can apply to become a teacher - not just existing teachers.
  if (pathname.startsWith("/teacher/apply")) {
    return status === "ACTIVE" ? NextResponse.next() : redirectToLogin();
  }

  const match = ROLE_PREFIXES.find(([prefix]) => pathname.startsWith(prefix));
  if (!match) return NextResponse.next();

  const [, requiredRole] = match;
  const allowed = status === "ACTIVE" && (roles.includes(requiredRole) || roles.includes("SUPER_ADMIN"));
  return allowed ? NextResponse.next() : redirectToLogin();
});

export const config = {
  matcher: ["/student/:path*", "/teacher/:path*", "/admin/:path*"],
};
