import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderForUser } from "@/server/services/order-service";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { orderId } = await params;
  const order = await getOrderForUser(session.user.id, orderId);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order });
}
