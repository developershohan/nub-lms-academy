import "dotenv/config";
import http from "node:http";
import { Server } from "socket.io";
import { authenticateSocket } from "./auth";
import { registerChatEvents, clearRateLimit } from "./events/chat.events";

// Railway/Render assign the port via PORT at runtime and expect the app to bind to it - SOCKET_PORT
// is only a fallback for local dev where you're choosing the port yourself.
const PORT = Number(process.env.PORT ?? process.env.SOCKET_PORT ?? 3001);
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:3000";
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

/** Lets the Next.js app (a separate process) push realtime events - e.g. "a role changed" or
 * "a new notification landed" - to already-connected clients. Next.js server actions/routes have
 * no direct handle on this process's `io` instance, so this HTTP hop is the bridge between them.
 * Guarded by a shared secret since it's an unauthenticated write into arbitrary rooms. */
const httpServer = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/internal/emit") return;

  if (!INTERNAL_SECRET || req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    res.writeHead(401).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { room, event, payload } = JSON.parse(body) as { room?: unknown; event?: unknown; payload?: unknown };
      if (typeof room === "string" && typeof event === "string") {
        io.to(room).emit(event, payload);
      }
      res.writeHead(200).end();
    } catch {
      res.writeHead(400).end();
    }
  });
});

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});

// Basic online/offline presence, tracked in memory (no Redis for this MVP - see README note on
// scaling to multiple socket-server instances later).
const connectionsByUser = new Map<string, number>();

io.use((socket, next) => {
  authenticateSocket(socket, next).catch(() => next(new Error("Unauthorized")));
});

io.on("connection", (socket) => {
  const { id: userId, roleNames } = socket.data.user;

  socket.join(`user:${userId}`);
  if (roleNames.includes("ADMIN") || roleNames.includes("SUPER_ADMIN")) socket.join("admins");

  const previousCount = connectionsByUser.get(userId) ?? 0;
  connectionsByUser.set(userId, previousCount + 1);
  if (previousCount === 0) io.emit("user:online", { userId });

  registerChatEvents(io, socket);

  socket.on("disconnect", () => {
    clearRateLimit(socket.id);
    const count = (connectionsByUser.get(userId) ?? 1) - 1;
    if (count <= 0) {
      connectionsByUser.delete(userId);
      io.emit("user:offline", { userId });
    } else {
      connectionsByUser.set(userId, count);
    }
  });
});

// Binding the host explicitly matters on Render/Railway: listen(port) with no host can bind
// IPv6-only in their containers, and their port-scanner only looks for 0.0.0.0 - without this the
// scanner never sees the app come up and the deploy gets stuck (502s forever even though the
// process is actually running fine).
httpServer.listen(PORT, "0.0.0.0");
console.log(`Socket.IO chat server listening on :${PORT} (CORS origin: ${CORS_ORIGIN})`);
if (!INTERNAL_SECRET) {
  console.warn("SOCKET_INTERNAL_SECRET is not set - realtime pushes from the Next.js app are disabled.");
}
