import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  listConversationSummariesForUser,
  startDirectConversation,
  startSupportConversation,
  getOrCreateCourseGroupConversation,
} from "@/server/services/chat-service";
import { parseJsonBody } from "@/lib/http/json";

// Explicit defense-in-depth for a user-specific endpoint - never let a future caching-default
// change silently make one user's conversations visible to another.
export const dynamic = "force-dynamic";

const startSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DIRECT"), otherUserId: z.string().min(1) }),
  z.object({ type: z.literal("COURSE_GROUP"), courseId: z.string().min(1) }),
  z.object({ type: z.literal("SUPPORT") }),
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const conversations = await listConversationSummariesForUser(session.user.id);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, startSchema);
  if ("response" in parsed) return parsed.response;

  const userId = session.user.id;
  const result =
    parsed.data.type === "DIRECT"
      ? await startDirectConversation(userId, parsed.data.otherUserId)
      : parsed.data.type === "COURSE_GROUP"
        ? await getOrCreateCourseGroupConversation(userId, parsed.data.courseId)
        : await startSupportConversation(userId);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
