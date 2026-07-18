import "dotenv/config";
import http, { type IncomingMessage } from "node:http";
import { Server } from "socket.io";
import { authenticateSocket } from "./auth";
import { registerChatEvents, clearRateLimit } from "./events/chat.events";

const REQUIRED_IN_PRODUCTION = ["AUTH_SECRET", "DATABASE_URL", "SOCKET_CORS_ORIGIN"] as const;

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Variable names only, never values - failing fast here beats a confusing 401/CORS failure
    // downstream that looks like a client bug but is actually a missing server config value.
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }
}

// Railway/Render assign the port via PORT at runtime and expect the app to bind to it - SOCKET_PORT
// is only a fallback for local dev where you're choosing the port yourself.
const PORT = Number(process.env.PORT ?? process.env.SOCKET_PORT ?? 3001);
// Comma-separated allow-list, trailing slashes stripped - never falls back to "*", since that's
// incompatible with credentialed (cookie/auth) requests.
const CORS_ORIGINS = (process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

const ENGINE_IO_ERROR_LABELS: Record<number, string> = {
  0: "Transport unknown",
  1: "Session ID unknown",
  2: "Bad handshake method",
  3: "Bad request",
  4: "Forbidden",
  5: "Unsupported protocol version",
};

/** Lets the Next.js app (a separate process) push realtime events - e.g. "a role changed" or
 * "a new notification landed" - to already-connected clients. Next.js server actions/routes have
 * no direct handle on this process's `io` instance, so this HTTP hop is the bridge between them.
 * Guarded by a shared secret since it's an unauthenticated write into arbitrary rooms - if the
 * secret isn't configured, every request is rejected rather than left open. */
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/internal/emit") {
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
    return;
  }

  // Socket.IO registers its own 'request' listener on this same server (see `new Server(httpServer, ...)`
  // below) and handles anything under /socket.io itself - leave those alone so it can respond.
  if (req.url?.startsWith("/socket.io")) return;

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({ status: "ok", service: "socket-server" })
    );
    return;
  }

  // Anything else - most importantly Render/Railway's health-check probe hitting "/" - needs a
  // real response. Leaving this unhandled means the request just hangs forever, which is why the
  // host's port scanner reports "no open ports" and never routes traffic here even though the
  // process is up and Socket.IO itself works fine.
  res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
});

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGINS, credentials: true },
});

// Handshake-level failures (bad/unknown session, unsupported protocol, malformed request) never
// reach our own auth middleware below - this is the only place they're observable at all.
io.engine.on(
  "connection_error",
  (err: { req?: IncomingMessage; code?: number; message?: string }) => {
    const url = err.req?.url ? new URL(err.req.url, "http://internal") : null;
    console.error("Engine.IO connection_error:", {
      code: err.code,
      reason: typeof err.code === "number" ? ENGINE_IO_ERROR_LABELS[err.code] : undefined,
      message: err.message,
      origin: err.req?.headers?.origin,
      method: err.req?.method,
      path: url?.pathname,
      transport: url?.searchParams.get("transport"),
    });
  }
);

// Basic online/offline presence, tracked in memory (no Redis for this MVP - see README note on
// scaling to multiple socket-server instances later).
const connectionsByUser = new Map<string, number>();

io.use((socket, next) => {
  authenticateSocket(socket, next).catch((err) => {
    console.error(
      `Socket auth (${socket.id}): unexpected error:`,
      err instanceof Error ? err.message : "unknown error"
    );
    next(new Error("Unauthorized"));
  });
});

io.on("connection", (socket) => {
  const { id: userId, roleNames } = socket.data.user;
  console.log(`Socket connected: user ${userId}, socket ${socket.id}, transport ${socket.conn.transport.name}`);

  socket.join(`user:${userId}`);
  if (roleNames.includes("ADMIN") || roleNames.includes("SUPER_ADMIN")) socket.join("admins");

  const previousCount = connectionsByUser.get(userId) ?? 0;
  connectionsByUser.set(userId, previousCount + 1);
  if (previousCount === 0) io.emit("user:online", { userId });

  registerChatEvents(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: user ${userId}, socket ${socket.id}, reason: ${reason}`);
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
console.log(`Socket.IO chat server listening on :${PORT} (CORS origins: ${CORS_ORIGINS.join(", ")})`);
if (!INTERNAL_SECRET) {
  console.warn("SOCKET_INTERNAL_SECRET is not set - /internal/emit will reject every request until it is.");
}
