import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listMessages, sendMessage } from "@/server/services/chat-service";
import { parseJsonBody } from "@/lib/http/json";

const sendSchema = z.object({ content: z.string().trim().min(1).max(2000) });

// Explicit defense-in-depth for a user-specific endpoint - never let a future caching-default
// change silently leak one conversation's messages into another user's request.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { conversationId } = await params;
  const result = await listMessages(session.user.id, conversationId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { conversationId } = await params;
  const parsed = await parseJsonBody(request, sendSchema);
  if ("response" in parsed) return parsed.response;

  const result = await sendMessage(session.user.id, conversationId, parsed.data.content);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
