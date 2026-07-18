"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;
let sharedSocketUserId: string | null = null;

type TokenResult = { token: string; userId: string } | { error: string };

/** Fetches a fresh socket auth token. Never throws - every failure mode (network, non-2xx,
 * malformed body) resolves to a sanitised, user-facing error string instead. */
async function fetchSocketToken(): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch("/api/v1/socket-token", { cache: "no-store", credentials: "same-origin" });
  } catch {
    return { error: "Socket token request failed" };
  }

  if (res.status === 401) return { error: "Not authenticated" };
  if (!res.ok) return { error: "Socket token request failed" };

  try {
    const data = await res.json();
    if (typeof data?.token !== "string" || !data.token || typeof data?.userId !== "string" || !data.userId) {
      return { error: "Socket token request failed" };
    }
    return { token: data.token, userId: data.userId };
  } catch {
    return { error: "Socket token request failed" };
  }
}

/** One shared connection per browser tab (not per component) so a dashboard page that renders
 * both a NotificationBell and a ChatShell doesn't open two sockets. Auth uses a short-lived
 * signed token (see /api/v1/socket-token) fetched fresh on every (re)connect attempt, rather
 * than the NextAuth session cookie - the socket server can live on a different domain than the
 * Next.js app in production, and browsers don't send one domain's cookies to another (see
 * socket-server/auth.ts). Transport is polling-only - see the comment below. */
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!socketUrl) {
      if (process.env.NODE_ENV === "production") {
        // Silently defaulting to localhost in a deployed build would just look like a hung
        // connection with no clue why - fail loudly instead of guessing an origin. Deferred one
        // tick since setState must not be called synchronously from inside an effect body.
        queueMicrotask(() => {
          if (!cancelled) setError("Socket server unavailable");
        });
        return;
      }
    }

    const isNewSocket = !sharedSocket;
    if (!sharedSocket) {
      sharedSocket = io(socketUrl ?? "http://localhost:3001", {
        // Some hosts' free-tier proxies don't cleanly pass through the HTTP Upgrade handshake
        // that a polling->websocket transport switch needs, even though plain HTTP (polling)
        // works fine - the socket connects, then gets killed a moment later while upgrading.
        // Staying on polling trades a little latency for connections that don't randomly drop.
        // Do not re-enable "websocket" until this is confirmed to work reliably in production.
        transports: ["polling"],
        auth: (cb) => {
          fetchSocketToken().then((result) => {
            if ("error" in result) {
              // cb must still be called or socket.io-client hangs the handshake forever - an
              // empty token gets rejected server-side and surfaces as a normal connect_error.
              cb({});
              return;
            }
            sharedSocketUserId = result.userId;
            cb({ token: result.token });
          });
        },
      });
    }
    const socket = sharedSocket;

    // The socket is a module-level singleton that outlives individual page navigations. If the
    // signed-in user changed since it last authenticated - e.g. logging in as a different user
    // from the /login page without a full reload in between - force it to re-handshake instead
    // of silently staying connected (and joined to realtime rooms) as the previous user.
    if (!isNewSocket) {
      fetchSocketToken().then((result) => {
        if (cancelled || "error" in result) return;
        if (sharedSocketUserId && sharedSocketUserId !== result.userId) {
          socket.disconnect();
          socket.connect();
        }
      });
    }

    const onConnect = () => {
      setConnected(true);
      setError(null);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error & { description?: unknown }) => {
      setConnected(false);
      const message =
        err.message === "Unauthorized" || err.message === "Not authenticated"
          ? "Socket authentication failed"
          : "Socket server unavailable";
      setError(message);
      // Sanitised on purpose: message/description/url/transport only - never the token, cookies,
      // headers, or a full user object.
      console.error("Socket connect_error:", {
        message: err.message,
        description: typeof err.description === "string" ? err.description : undefined,
        url: socketUrl,
        transport: "polling",
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    // Syncs state to the socket's current status when reusing an already-connected shared
    // socket - deferred one tick since setState must not be called synchronously in an effect.
    queueMicrotask(() => {
      if (!cancelled) setConnected(socket.connected);
    });

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  return { socket: sharedSocket, connected, error };
}
