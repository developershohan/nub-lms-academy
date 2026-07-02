import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConversationParticipants } from "@/server/services/chat-service";

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { conversationId } = await params;
  const result = await getConversationParticipants(session.user.id, conversationId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
