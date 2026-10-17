import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http/json";
import { getConversationSummary, setConversationMuted } from "@/server/services/chat-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ conversationId: string }> };

/** One conversation as the caller sees it - the inbox fetches this when a new one appears. */
export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { conversationId } = await params;
  const result = await getConversationSummary(session.user.id, conversationId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 403 });
  return NextResponse.json(result);
}

const patchSchema = z.object({ mutedUntil: z.iso.datetime().nullable() });

/** Mute notifications until a time, or unmute with null. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { conversationId } = await params;
  const parsed = await parseJsonBody(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const result = await setConversationMuted(session.user.id, conversationId, parsed.data.mutedUntil ? new Date(parsed.data.mutedUntil) : null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
