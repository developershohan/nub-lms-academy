"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

/** One shared connection per browser tab (not per component) so a dashboard page that renders
 * both a NotificationBell and a ChatShell doesn't open two sockets. The cookie-based NextAuth
 * session is sent automatically via withCredentials, since the socket server trusts the same
 * "authjs.session-token" cookie the Next.js app set (see socket-server/auth.ts). */
export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001", {
        withCredentials: true,
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
