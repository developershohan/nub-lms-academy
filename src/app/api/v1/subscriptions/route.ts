import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listActivePlans, listSubscriptionsForUser, createSubscriptionCheckoutSession } from "@/server/services/subscription-service";

const schema = z.object({ planId: z.string().min(1) });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ plans: await listActivePlans() });
  }
  const [plans, subscriptions] = await Promise.all([
    listActivePlans(),
    listSubscriptionsForUser(session.user.id),
  ]);
  return NextResponse.json({ plans, subscriptions });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const result = await createSubscriptionCheckoutSession(session.user.id, parsed.data.planId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
