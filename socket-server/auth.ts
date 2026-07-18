import type { Socket } from "socket.io";
import { verifySocketToken } from "@/lib/socket-token";
import { getActiveUserWithRoles } from "./chat-store";

/**
 * Re-checks DB user status/roles on every connection (not just decoding the token), per the
 * project's Socket.IO security rules - a banned-after-login user must be disconnected.
 *
 * Every rejection path logs a specific, sanitised reason (missing secret, missing token, which
 * kind of token failure, DB failure, missing/inactive user) so Render's logs can tell these
 * apart - but the client always gets the same generic "Unauthorized", since the failure reason
 * itself (e.g. "this user doesn't exist") must never be observable from the browser.
 */
export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error(`Socket auth (${socket.id}): AUTH_SECRET is not configured`);
    return next(new Error("Unauthorized"));
  }

  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) {
    console.warn(`Socket auth (${socket.id}): no token provided`);
    return next(new Error("Unauthorized"));
  }

  const result = verifySocketToken(token, secret);
  if ("error" in result) {
    console.warn(`Socket auth (${socket.id}): token rejected (${result.error})`);
    return next(new Error("Unauthorized"));
  }

  let user: Awaited<ReturnType<typeof getActiveUserWithRoles>>;
  try {
    user = await getActiveUserWithRoles(result.userId);
  } catch (err) {
    console.error(`Socket auth (${socket.id}): database lookup failed:`, err instanceof Error ? err.message : "unknown error");
    return next(new Error("Unauthorized"));
  }

  if (!user) {
    console.warn(`Socket auth (${socket.id}): user missing or inactive`);
    return next(new Error("Unauthorized"));
  }

  console.log(`Socket auth (${socket.id}): authenticated user ${user.id}`);
  socket.data.user = user;
  next();
}
