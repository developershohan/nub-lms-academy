import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import RedisMock from "ioredis-mock";
import type Redis from "ioredis";
import { Server } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { Emitter } from "@socket.io/redis-emitter";
import { createRedisAdapter } from "./redis";

/*
 * Two socket server nodes sharing one (mock) Redis, the way they would on Render or a VPS, plus
 * the emitter Next.js uses. Proves the wiring: an event emitted on one node, or published from
 * Next.js, reaches a client connected to the other node.
 */

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

const mockRedis = () => new RedisMock() as unknown as Redis;

async function startNode() {
  const httpServer = http.createServer();
  const { adapter, pubClient, subClient } = createRedisAdapter("redis://mock", mockRedis);
  const io = new Server(httpServer, { adapter });
  io.on("connection", (socket) => socket.join(`user:${socket.handshake.auth.userId}`));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  cleanup.push(() => {
    io.close();
    pubClient.disconnect();
    subClient.disconnect();
  });
  return { io, port: (httpServer.address() as AddressInfo).port };
}

async function connectClient(port: number, userId: string) {
  const client = connect(`http://localhost:${port}`, { transports: ["websocket"], auth: { userId }, forceNew: true });
  cleanup.push(() => client.close());
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", reject);
  });
  // Let the adapter finish subscribing to the user's room.
  await new Promise((resolve) => setTimeout(resolve, 50));
  return client;
}

const next = (client: ClientSocket, event: string) =>
  new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within 2s`)), 2000);
    client.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe("Redis adapter wiring", () => {
  it("delivers an emit from one node to a client connected to another", async () => {
    const [a, b] = [await startNode(), await startNode()];
    const client = await connectClient(b.port, "u1");

    const received = next(client, "message:new");
    a.io.to("user:u1").emit("message:new", { seq: 7 });
    await expect(received).resolves.toEqual({ seq: 7 });
  });

  it("delivers what Next.js publishes through the emitter, and disconnects on request", async () => {
    const node = await startNode();
    const client = await connectClient(node.port, "u2");
    // A real Redis hands subscribers bytes, and ioredis raises "messageBuffer" for every message.
    // The mock only does that for Buffer payloads, so publish bytes as Redis would deliver them.
    const redis = mockRedis();
    const emitter = new Emitter({
      publish: (channel: string, message: string | Buffer) =>
        redis.publish(channel, Buffer.isBuffer(message) ? message : Buffer.from(message)),
    });

    const received = next(client, "notification:new");
    emitter.to("user:u2").emit("notification:new", { title: "Course approved" });
    await expect(received).resolves.toEqual({ title: "Course approved" });

    const disconnected = next(client, "disconnect");
    emitter.in("user:u2").disconnectSockets(true);
    await expect(disconnected).resolves.toBe("io server disconnect");
  });
});
