import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listNotificationsForUser, countUnreadNotifications } from "@/server/services/notification-service";

// Explicit defense-in-depth for a user-specific endpoint - never let a future caching-default
// change silently make one user's notifications visible to another.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(session.user.id),
    countUnreadNotifications(session.user.id),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
