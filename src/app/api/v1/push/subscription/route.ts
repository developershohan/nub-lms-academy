import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http/json";
import { deletePushSubscription, savePushSubscription } from "@/server/services/notification-service";

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Saves this browser's Web Push subscription for the signed-in user. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: "Push notifications aren't set up on this server" }, { status: 503 });
  }
  const parsed = await parseJsonBody(request, subscriptionSchema);
  if ("response" in parsed) return parsed.response;
  // Only real push services: a subscription pointing anywhere else would make the worker send
  // requests to an address the user chose.
  if (!parsed.data.endpoint.startsWith("https://")) return NextResponse.json({ error: "Invalid push endpoint" }, { status: 400 });
  return NextResponse.json(await savePushSubscription(session.user.id, parsed.data, request.headers.get("user-agent")));
}

const deleteSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = await parseJsonBody(request, deleteSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json(await deletePushSubscription(session.user.id, parsed.data.endpoint));
}
