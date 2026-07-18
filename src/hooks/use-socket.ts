"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

/** One shared connection per browser tab (not per component) so a dashboard page that renders
 * both a NotificationBell and a ChatShell doesn't open two sockets. Auth uses a short-lived
 * signed token (see /api/v1/socket-token) fetched fresh on every (re)connect attempt, rather
 * than the NextAuth session cookie - the socket server can live on a different domain than the
 * Next.js app in production, and browsers don't send one domain's cookies to another (see
 * socket-server/auth.ts). */
export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001", {
        // Some hosts' free-tier proxies don't cleanly pass through the HTTP Upgrade handshake
        // that a polling->websocket transport switch needs, even though plain HTTP (polling)
        // works fine - the socket connects, then gets killed a moment later while upgrading.
        // Staying on polling trades a little latency for connections that don't randomly drop.
        transports: ["polling"],
        auth: async (cb) => {
          const res = await fetch("/api/v1/socket-token");
          const data = await res.json();
          cb({ token: data.token });
        },
      });
    }
    const socket = sharedSocket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: sharedSocket, connected };
}
