import type { RoleName } from "@/generated/prisma/client";

const ROLE_PREFIXES = ["/student", "/teacher", "/admin"] as const;

/** Where a user's own dashboard lives, ranked by privilege so multi-role users land somewhere sensible. */
export function getRoleHome(roles: RoleName[]): string {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "/admin/dashboard";
  if (roles.includes("TEACHER")) return "/teacher/dashboard";
  return "/student/dashboard";
}

/**
 * A requested redirect (e.g. `?callbackUrl=`) is only safe to honor as-is when it isn't one of the
 * role-gated dashboard prefixes for a DIFFERENT role - otherwise an admin following a link meant for
 * a student (or vice versa) would land on someone else's dashboard shell instead of their own.
 */
export function resolveLoginDestination(roles: RoleName[], requestedCallback?: string | null): string {
  if (requestedCallback && !ROLE_PREFIXES.some((prefix) => requestedCallback.startsWith(prefix))) {
    return requestedCallback;
  }
  return getRoleHome(roles);
}
