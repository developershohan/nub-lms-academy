import type { RoleName } from "@/generated/prisma/client";

const ROLE_PREFIXES = ["/student", "/teacher", "/admin"] as const;

/** Where a user's own dashboard lives, ranked by privilege so multi-role users land somewhere sensible. */
export function getRoleHome(roles: RoleName[]): string {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "/admin/dashboard";
  if (roles.includes("SUPPORT")) return "/admin/messages";
  if (roles.includes("TEACHER")) return "/teacher/dashboard";
  return "/student/dashboard";
}

/** The inbox in the user's own dashboard - where /messages (notification links) sends them. */
export function getMessagesHome(roles: RoleName[]): string {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN") || roles.includes("SUPPORT")) return "/admin/messages";
  if (roles.includes("TEACHER")) return "/teacher/messages";
  return "/student/messages";
}

export type RoleDashboard = { key: "student" | "teacher" | "admin"; label: string; href: string };

/**
 * Every dashboard a user can open, for the user menu's role switcher. Mirrors the layout gates:
 * /teacher lets SUPER_ADMIN in, /admin lets SUPPORT in (but only to messages).
 */
export function getRoleDashboards(roles: RoleName[]): RoleDashboard[] {
  const dashboards: RoleDashboard[] = [];
  if (roles.includes("STUDENT")) {
    dashboards.push({ key: "student", label: "Student", href: "/student/dashboard" });
  }
  if (roles.includes("TEACHER") || roles.includes("SUPER_ADMIN")) {
    dashboards.push({ key: "teacher", label: "Teacher", href: "/teacher/dashboard" });
  }
  if (roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) {
    dashboards.push({ key: "admin", label: "Admin", href: "/admin/dashboard" });
  } else if (roles.includes("SUPPORT")) {
    dashboards.push({ key: "admin", label: "Support", href: "/admin/messages" });
  }
  return dashboards;
}

/** Which dashboard area a path belongs to. /teacher/apply is the public pitch page, not the dashboard. */
export function getDashboardKey(pathname: string): RoleDashboard["key"] | null {
  if (isUnder(pathname, "/student")) return "student";
  if (isUnder(pathname, "/teacher") && !isUnder(pathname, "/teacher/apply")) return "teacher";
  if (isUnder(pathname, "/admin")) return "admin";
  return null;
}

/** Whether a nav link points at the current page or one of its sub-pages (/student/certificates/abc
 * still highlights Certificates). Matches whole path segments, so /admin/courses-x isn't /admin/courses. */
export function isUnder(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Same-origin paths only. "//host" and "/\host" are protocol-relative to browsers, and since
 * browsers strip tabs/newlines from URLs, "/<tab>/host" would become "//host" too - so any
 * whitespace or control character disqualifies the URL rather than trying to clean it up. */
function isSafeRelativePath(url: string) {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") && !/[\s\u0000-\u001f\u007f]/.test(url);
}

/**
 * A requested redirect (e.g. `?callbackUrl=`) is only safe to honor as-is when it's a same-origin
 * path (anything else is an open redirect off the login page) that isn't one of the role-gated
 * dashboard prefixes for a DIFFERENT role - otherwise an admin following a link meant for a
 * student (or vice versa) would land on someone else's dashboard shell instead of their own.
 */
export function resolveLoginDestination(roles: RoleName[], requestedCallback?: string | null): string {
  if (
    requestedCallback &&
    isSafeRelativePath(requestedCallback) &&
    !ROLE_PREFIXES.some((prefix) => requestedCallback.startsWith(prefix))
  ) {
    return requestedCallback;
  }
  return getRoleHome(roles);
}
