import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSocketToken } from "@/lib/socket-token";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  return NextResponse.json({ token: createSocketToken(session.user.id, secret) });
}
