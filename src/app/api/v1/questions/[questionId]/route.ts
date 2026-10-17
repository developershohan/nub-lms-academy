import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http/json";
import { getChatUser } from "@/server/chat/access";
import { answerQuestion, getQuestion, moderateQuestion, toggleUpvote } from "@/server/chat/qa";
import { notify } from "@/server/services/notification-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ questionId: string }> };

async function currentUser() {
  const session = await auth();
  return session?.user?.id ? getChatUser(session.user.id) : null;
}

/** A question with its answers. */
export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { questionId } = await params;
  const result = await getQuestion(user, questionId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 403 });
  return NextResponse.json(result);
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("upvote") }),
  z.object({ action: z.literal("accept"), answerId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
  z.object({ action: z.literal("answered"), answered: z.boolean() }),
]);

/** Answer, upvote, accept an answer, pin, or mark answered. */
export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { questionId } = await params;
  const parsed = await parseJsonBody(request, actionSchema);
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  const result =
    input.action === "answer"
      ? await answerQuestion(notify, user, questionId, input.body)
      : input.action === "upvote"
        ? await toggleUpvote(user, questionId)
        : input.action === "accept"
          ? await moderateQuestion(user, questionId, { acceptAnswerId: input.answerId })
          : input.action === "pin"
            ? await moderateQuestion(user, questionId, { pinned: input.pinned })
            : await moderateQuestion(user, questionId, { answered: input.answered });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Forbidden" ? 403 : 400 });
  return NextResponse.json(result);
}
