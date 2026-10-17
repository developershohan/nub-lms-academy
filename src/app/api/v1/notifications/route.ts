import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listNotificationsForUser, countUnreadNotifications } from "@/server/services/notification-service";

// Explicit defense-in-depth for a user-specific endpoint - never let a future caching-default
// change silently make one user's notifications visible to another.
export const dynamic = "force-dynamic";

/** ?before=<id> for the next page, ?unread=1 for unread only. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const before = url.searchParams.get("before")?.slice(0, 64) || undefined;
  const unreadOnly = url.searchParams.get("unread") === "1";
  const [page, unreadCount] = await Promise.all([
    listNotificationsForUser(session.user.id, { before, unreadOnly }),
    countUnreadNotifications(session.user.id),
  ]);
  return NextResponse.json({ ...page, unreadCount });
}
