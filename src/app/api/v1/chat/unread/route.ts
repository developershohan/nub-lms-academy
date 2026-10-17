import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unreadSummary } from "@/server/services/chat-service";

export const dynamic = "force-dynamic";

/** Unread per conversation and in total, for the header badge. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(await unreadSummary(session.user.id));
}
