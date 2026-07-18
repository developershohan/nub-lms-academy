import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSocketToken } from "@/lib/socket-token";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  let session;
  try {
    session = await auth();
  } catch (err) {
    console.error("socket-token: session lookup failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Socket token request failed" }, { status: 500, headers: NO_STORE });
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: NO_STORE });
  }

  // AUTH_SECRET is the one signing secret shared by the Next.js app and the standalone socket
  // server (see socket-server/auth.ts) - both must have the same value for tokens to verify.
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("socket-token: AUTH_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  }

  const token = createSocketToken(session.user.id, secret);
  // userId is included so the client can detect "I'm now signed in as someone else" after a
  // same-tab login switch and force the shared socket to re-authenticate - it's not sensitive,
  // the caller already knows their own id from the session that produced it.
  return NextResponse.json({ token, userId: session.user.id }, { headers: NO_STORE });
}
