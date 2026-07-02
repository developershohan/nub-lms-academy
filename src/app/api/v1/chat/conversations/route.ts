import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  listConversationSummariesForUser,
  startDirectConversation,
  startSupportConversation,
  getOrCreateCourseGroupConversation,
} from "@/server/services/chat-service";

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

  const body = await request.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

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
