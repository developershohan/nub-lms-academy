// The socket server as a factory: index.ts runs one for real, the integration tests and the load
// test start several in one process. Stateless nodes behind any load balancer, joined up by Redis.
import http, { type IncomingMessage } from "node:http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { rooms } from "@/server/realtime/bus";
import { createMemoryPresence, createRedisPresence } from "@/server/realtime/presence";
import { createMemoryRateLimiter, createRedisRateLimiter } from "@/server/realtime/rate-limit";
import { getQueue } from "@/server/realtime/queues";
import { isStaff } from "@/server/chat/access";
import { authenticateSocket } from "./auth";
import { AccessCache, UserCache, type GatewayContext } from "./context";
import { registerChatEvents } from "./events/chat.events";
import { createRedisAdapter } from "./redis";

const HEARTBEAT_MS = 20_000;

const ENGINE_IO_ERROR_LABELS: Record<number, string> = {
  0: "Transport unknown",
  1: "Session ID unknown",
  2: "Bad handshake method",
  3: "Bad request",
  4: "Forbidden",
  5: "Unsupported protocol version",
};

export type GatewayOptions = {
  corsOrigins: string[];
  /** Null runs a single node with in-memory presence and rate limits (local development only). */
  redisUrl: string | null;
  /** Guards the /internal/* HTTP bridge Next.js uses when there is no Redis. */
  internalSecret?: string;
  quiet?: boolean;
};

export type Gateway = {
  io: Server;
  httpServer: http.Server;
  ctx: GatewayContext;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
};

/** DM partners: the contacts told when this user comes online or goes offline. */
async function directPartnerIds(userId: string) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId: { not: userId }, removedAt: null, conversation: { type: "DIRECT", participants: { some: { userId } } } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export function createGateway(options: GatewayOptions): Gateway {
  const { redisUrl, internalSecret } = options;
  const log = options.quiet ? () => {} : console.log;
  const redis = redisUrl ? createRedisAdapter(redisUrl, undefined, { recoverable: true }) : null;
  const commandClient = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 3 }) : null;
  commandClient?.on("error", (err) => console.error("Redis command client error:", err.message));

  /** Reads a JSON body from an internal request and answers 200/400. */
  function internal(req: IncomingMessage, res: http.ServerResponse, handle: (body: Record<string, unknown>) => void) {
    if (!internalSecret || req.headers["x-internal-secret"] !== internalSecret) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        handle(JSON.parse(body) as Record<string, unknown>);
        res.writeHead(200).end();
      } catch {
        res.writeHead(400).end();
      }
    });
  }

  /** Lets the Next.js app (a separate process) push realtime events when Redis isn't configured.
   * With Redis, src/lib/realtime.ts publishes through the emitter instead and this is unused.
   * Guarded by a shared secret since it's an unauthenticated write into arbitrary rooms - if the
   * secret isn't configured, every request is rejected rather than left open. */
  const httpServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/internal/emit") {
      return internal(req, res, ({ room, event, payload }) => {
        if (typeof room === "string" && typeof event === "string") io.to(room).emit(event, payload);
      });
    }
    if (req.method === "POST" && req.url === "/internal/disconnect") {
      // Sent on ban / password change / password reset / role change: close every live connection
      // of that user. A reconnect re-runs authenticateSocket, which refuses a banned account.
      return internal(req, res, ({ userId }) => {
        if (typeof userId === "string" && userId) io.in(rooms.user(userId)).disconnectSockets(true);
      });
    }
    if (req.method === "POST" && req.url === "/internal/leave") {
      return internal(req, res, ({ userId, room }) => {
        if (typeof userId === "string" && typeof room === "string") io.in(rooms.user(userId)).socketsLeave(room);
      });
    }
    if (req.method === "POST" && req.url === "/internal/invalidate") {
      return internal(req, res, ({ userId }) => {
        if (typeof userId === "string") invalidate(userId);
      });
    }

    // Socket.IO registers its own 'request' listener on this same server (see `new Server(httpServer, ...)`
    // below) and handles anything under /socket.io itself - leave those alone so it can respond.
    if (req.url?.startsWith("/socket.io")) return;

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({ status: "ok", service: "socket-server", adapter: redis ? "redis" : "memory", redis: commandClient?.status })
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
    cors: { origin: options.corsOrigins, credentials: true },
    // WebSocket first; long-polling only when a network or proxy blocks the upgrade.
    transports: ["websocket", "polling"],
    // A client that drops for under two minutes and comes back to the same node gets the events it
    // missed replayed; anything else falls back to the chat `sync` protocol.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: false },
    ...(redis ? { adapter: redis.adapter } : {}),
  });

  const access = new AccessCache();
  const users = new UserCache();
  function invalidate(userId: string) {
    access.invalidate(userId);
    users.invalidate(userId);
  }
  // Another node, or the web app's emitter, changed something a user's cached permissions depend on.
  io.on("chat:invalidate", (userId: string) => invalidate(userId));

  const ctx: GatewayContext = {
    io,
    presence: commandClient ? createRedisPresence(commandClient) : createMemoryPresence(),
    limiter: commandClient ? createRedisRateLimiter(commandClient) : createMemoryRateLimiter(),
    access,
    users,
    queue: redisUrl ? getQueue("delivery") : null,
    invalidate: (userId) => {
      invalidate(userId);
      io.serverSideEmit("chat:invalidate", userId);
    },
  };

  // Handshake-level failures (bad/unknown session, unsupported protocol, malformed request) never
  // reach our own auth middleware below - this is the only place they're observable at all.
  io.engine.on("connection_error", (err: { req?: IncomingMessage; code?: number; message?: string }) => {
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
  });

  io.use((socket, next) => {
    authenticateSocket(socket, next).catch((err) => {
      console.error(`Socket auth (${socket.id}): unexpected error:`, err instanceof Error ? err.message : "unknown error");
      next(new Error("Unauthorized"));
    });
  });

  io.on("connection", (socket) => {
    const { id: userId } = socket.data.user;
    socket.data.viewing ??= null;
    socket.data.typingAt ??= {};
    users.markChecked(userId);
    log(`Socket connected: user ${userId}, socket ${socket.id}, transport ${socket.conn.transport.name}${socket.recovered ? ", recovered" : ""}`);

    socket.join(rooms.user(userId));
    if (isStaff(socket.data.user)) socket.join(rooms.staff);

    // Presence is a Redis TTL key per user, refreshed by the heartbeat below, and only ever shown to
    // contacts (people who share a conversation) - never broadcast to the whole platform.
    registerChatEvents(ctx, socket);
    void (async () => {
      await ctx.presence.touchOnline([userId]);
      if (socket.recovered) return;
      for (const partnerId of await directPartnerIds(userId)) io.to(rooms.user(partnerId)).emit("user:online", { userId });
    })().catch((err) => console.error("Presence (connect) failed:", err instanceof Error ? err.message : err));

    let conversationRooms: string[] = [];
    socket.on("disconnecting", () => {
      conversationRooms = [...socket.rooms].filter((room) => room.startsWith("conversation:"));
    });
    socket.on("disconnect", (reason) => {
      log(`Socket disconnected: user ${userId}, socket ${socket.id}, reason: ${reason}`);
      void (async () => {
        if (socket.data.viewing) await ctx.presence.stopViewing(userId, socket.data.viewing);
        // Still connected in another tab or on another node? Then they haven't gone anywhere.
        const remaining = await io.in(rooms.user(userId)).fetchSockets();
        if (remaining.length > 0) return;
        await ctx.presence.markOffline(userId);
        const partners = await directPartnerIds(userId);
        const targets = [...partners.map(rooms.user), ...conversationRooms];
        if (targets.length) io.to(targets).emit("user:offline", { userId });
      })().catch((err) => console.error("Presence (disconnect) failed:", err instanceof Error ? err.message : err));
    });
  });

  // Keeps this node's users' presence (and "viewing") keys alive; a crashed node's keys just expire.
  const heartbeat = setInterval(() => {
    const sockets = [...io.of("/").sockets.values()];
    const userIds = [...new Set(sockets.map((s) => s.data.user?.id).filter(Boolean))] as string[];
    const viewing = sockets
      .filter((s) => s.data.user && s.data.viewing)
      .map((s) => ({ userId: s.data.user.id as string, conversationId: s.data.viewing as string }));
    Promise.all([ctx.presence.touchOnline(userIds), ctx.presence.touchViewing(viewing)]).catch((err) =>
      console.error("Presence heartbeat failed:", err instanceof Error ? err.message : err)
    );
    access.sweep();
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    io,
    httpServer,
    ctx,
    listen(port, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        // Binding the host explicitly matters on Render/Railway: listen(port) with no host can bind
        // IPv6-only in their containers, and their port-scanner only looks for 0.0.0.0.
        httpServer.listen(port, host, () => {
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    async close() {
      clearInterval(heartbeat);
      // Closes every client connection; they reconnect (to this node once it's back, or another).
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.all([redis?.pubClient, redis?.subClient, commandClient].map((c) => c?.quit().catch(() => c.disconnect())));
    },
  };
}
