import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const status = req.auth?.user?.status;

  // The teacher-application pitch is public marketing chrome; the page renders a
  // login CTA for anonymous visitors and the apply action re-checks auth itself.
  if (pathname === "/teacher/apply") return NextResponse.next();

  const isProtected =
    pathname.startsWith("/student") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/profile");
  if (!isProtected) return NextResponse.next();

  if (status === "ACTIVE") return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
});

// Role checks intentionally happen only in each page/layout (via getCurrentUser(), which
// re-reads the DB), not here. The JWT's `roles` claim is only refreshed at sign-in, so a role
// change (e.g. a teacher application being approved) wouldn't take effect here until the user
// logged out and back in - the DB-backed check in every admin/teacher page is what makes a role
// change apply immediately instead.

export const config = {
  matcher: ["/student/:path*", "/teacher/:path*", "/admin/:path*", "/profile/:path*"],
};
