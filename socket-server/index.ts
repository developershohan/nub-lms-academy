import "dotenv/config";
import { Server } from "socket.io";
import { authenticateSocket } from "./auth";
import { registerChatEvents, clearRateLimit } from "./events/chat.events";

const PORT = Number(process.env.SOCKET_PORT ?? 3001);
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:3000";

const io = new Server({
  cors: { origin: CORS_ORIGIN, credentials: true },
});

// Basic online/offline presence, tracked in memory (no Redis for this MVP - see README note on
// scaling to multiple socket-server instances later).
const connectionsByUser = new Map<string, number>();

io.use((socket, next) => {
  authenticateSocket(socket, next).catch(() => next(new Error("Unauthorized")));
});

io.on("connection", (socket) => {
  const { id: userId } = socket.data.user;

  socket.join(`user:${userId}`);
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

io.listen(PORT);
console.log(`Socket.IO chat server listening on :${PORT} (CORS origin: ${CORS_ORIGIN})`);
