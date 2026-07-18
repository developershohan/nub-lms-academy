import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCheckoutSession } from "@/server/services/order-service";
import { parseJsonBody } from "@/lib/http/json";

const schema = z.object({ courseId: z.string().min(1), couponCode: z.string().max(64).optional() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, schema);
  if ("response" in parsed) return parsed.response;

  const result = await createCheckoutSession(session.user.id, parsed.data.courseId, parsed.data.couponCode);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
