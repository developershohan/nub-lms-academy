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

export function verifySocketToken(token: string, secret: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;

  try {
    const { id, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof id !== "string" || typeof exp !== "number" || Date.now() > exp) return null;
    return id;
  } catch {
    return null;
  }
}
