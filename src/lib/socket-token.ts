// No "server-only" here and no Next-specific imports - this file is shared with socket-server/
// (a standalone Node process outside the Next.js build, see socket-server/chat-store.ts's note
// on why that process can't import most of src/lib/*).
import crypto from "node:crypto";

const TOKEN_TTL_MS = 60_000; // only needs to survive the handshake, not the whole connection

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Short-lived, HMAC-signed token proving a socket connection belongs to a given user.
 *
 * The Next.js app and the socket server are deployed on different domains in production
 * (e.g. Vercel + Railway), so the browser never sends the NextAuth session cookie to the socket
 * server - cookie-based auth only works when both happen to share a hostname (like in local dev).
 * This token is issued by the Next.js app per connection attempt and checked by the socket
 * server instead, using the AUTH_SECRET both processes already share.
 */
export function createSocketToken(userId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export type SocketTokenError = "malformed" | "bad_signature" | "invalid_payload" | "expired";
export type SocketTokenResult = { userId: string } | { error: SocketTokenError };

/**
 * Returns a specific failure reason (not just true/false) so the socket server can log *why* a
 * token was rejected - useful for telling a stale/expired token apart from a forged one when
 * reading Render logs. The reason must never be sent back to the client: the caller should
 * always respond with a single generic "Unauthorized" regardless of which case this returns.
 */
export function verifySocketToken(token: string, secret: string): SocketTokenResult {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return { error: "malformed" };

  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { error: "bad_signature" };
  }

  try {
    const { id, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof id !== "string" || typeof exp !== "number") return { error: "invalid_payload" };
    if (Date.now() > exp) return { error: "expired" };
    return { userId: id };
  } catch {
    return { error: "invalid_payload" };
  }
}
