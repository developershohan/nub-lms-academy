// Helpers for the real-time integration suites: in-process socket server nodes on random ports,
// real socket.io clients authenticated with real socket tokens, and small waiting utilities.
import IORedis from "ioredis";
import { io as connect, type Socket } from "socket.io-client";
import { prisma } from "@/lib/prisma";
import { createSocketToken } from "@/lib/socket-token";
import { createGateway, type Gateway } from "../../socket-server/gateway";

const gateways: Gateway[] = [];
const sockets: Socket[] = [];

export async function startGateway(redisUrl: string | null) {
  const gateway = createGateway({ corsOrigins: ["http://localhost"], redisUrl, quiet: true });
  const port = await gateway.listen(0, "127.0.0.1");
  gateways.push(gateway);
  return { gateway, url: `http://127.0.0.1:${port}`, port };
}

/** A connected client. A fresh token per (re)connect, like the browser's auth callback. */
export function connectAs(url: string, userId: string, { autoConnect = true } = {}): Socket {
  const socket = connect(url, {
    transports: ["websocket"],
    forceNew: true,
    autoConnect,
    reconnectionDelay: 100,
    reconnectionDelayMax: 300,
    auth: (cb) => cb({ token: createSocketToken(userId, process.env.AUTH_SECRET!) }),
  });
  sockets.push(socket);
  return socket;
}

export function connected(socket: Socket, timeoutMs = 5_000) {
  if (socket.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket did not connect")), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Resolves with the first `event` payload that matches. */
export function nextEvent<T = unknown>(socket: Socket, event: string, match: (payload: T) => boolean = () => true, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

/** Collects every payload of an event from now on. */
export function collect<T = unknown>(socket: Socket, event: string) {
  const items: T[] = [];
  socket.on(event, (payload: T) => items.push(payload));
  return items;
}

export async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("condition not met in time");
}

export async function join(socket: Socket, conversationId: string) {
  const result = (await socket.timeout(5_000).emitWithAck("conversation:join", conversationId)) as { error?: string; online?: string[] };
  if (result.error) throw new Error(`join failed: ${result.error}`);
  return result;
}

let counter = 0;
export const clientMsgId = () => `test-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type SendAck = { error?: string; message?: { id: string; seq: number; content: string; conversationId: string } };

export async function send(socket: Socket, conversationId: string, content: string, id = clientMsgId()): Promise<SendAck> {
  return socket.timeout(5_000).emitWithAck("message:send", { conversationId, clientMsgId: id, content });
}

export async function flushRedis(url: string) {
  const redis = new IORedis(url, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  await redis.quit();
}

export async function stopAll() {
  for (const s of sockets.splice(0)) s.disconnect();
  for (const g of gateways.splice(0)) await g.close();
}

/** A DM between two users, created the way the app does. */
export async function directConversation(a: string, b: string) {
  const uniqueKey = `direct:${[a, b].sort().join(":")}`;
  return prisma.conversation.create({ data: { type: "DIRECT", uniqueKey, participants: { create: [{ userId: a }, { userId: b }] } } });
}
