import type { Socket } from "socket.io";
import { getToken } from "next-auth/jwt";
import { getActiveUserWithRoles } from "./chat-store";

/** Re-checks DB user status/roles on every connection (not just decoding the JWT), per the
 * project's Socket.IO security rules - a banned-after-login user must be disconnected. */
export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return next(new Error("Server misconfigured"));

    const token = await getToken({
      req: { headers: socket.request.headers as Record<string, string> },
      secret,
      secureCookie: process.env.NODE_ENV === "production",
    });
    const userId = typeof token?.id === "string" ? token.id : undefined;
    if (!userId) return next(new Error("Unauthorized"));

    const user = await getActiveUserWithRoles(userId);
    if (!user) return next(new Error("Unauthorized"));

    socket.data.user = user;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}
