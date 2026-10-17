/*
 * Chat load test: N concurrent users on G socket server nodes (Redis adapter), real WebSocket
 * clients speaking the app's protocol (ack, clientMsgId retry, seq gap sync), optionally killing
 * one node mid-run. Reports delivery latency (sender's clock -> receiver's message:new, same
 * machine) and checks that no message was lost.
 *
 *   npm run build:services
 *   npx tsx scripts/load/chat-load.ts --users 500 --duration 60 --nodes 2 --restart
 *
 * Needs DATABASE_URL (a THROWAWAY database - it creates ~N users and deletes them afterwards),
 * REDIS_URL and AUTH_SECRET. k6 and Artillery can't follow a Socket.IO fan-out (who received
 * which seq, and when) without custom code, so this drives socket.io-client directly instead.
 */
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { io, type Socket } from "socket.io-client";
import { prisma } from "@/lib/prisma";
import { createSocketToken } from "@/lib/socket-token";

type WireMessage = { id: string; seq: number; conversationId: string; senderId: string; content: string; sender: { id: string } };

function arg(name: string, fallback: number): number;
function arg(name: string, fallback: boolean): boolean;
function arg(name: string, fallback: number | boolean) {
  const index = process.argv.indexOf(`--${name}`);
  if (typeof fallback === "boolean") return index !== -1 || fallback;
  return index !== -1 ? Number(process.argv[index + 1]) : fallback;
}

const USERS = arg("users", 500);
const DURATION_S = arg("duration", 60);
const NODES = arg("nodes", 2);
const RESTART = arg("restart", false);
const BASE_PORT = arg("port", 4100);
const SEND_MIN_MS = arg("min-interval", 3000);
const SEND_MAX_MS = arg("max-interval", 6000);
const GROUP_SIZE = 10;
const RUN = randomUUID().slice(0, 8);

const secret = process.env.AUTH_SECRET;
if (!secret || !process.env.DATABASE_URL || !process.env.REDIS_URL) {
  console.error("Set DATABASE_URL (throwaway), REDIS_URL and AUTH_SECRET.");
  process.exit(1);
}

const root = path.resolve(__dirname, "../..");
const children = new Map<string, ChildProcess>();

function startProcess(name: string, script: string, env: Record<string, string>) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", (chunk) => {
    const line = String(chunk).trim();
    if (line && !line.includes("Socket auth")) console.error(`[${name}] ${line.split("\n")[0]}`);
  });
  children.set(name, child);
  return child;
}

async function waitForHealth(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok && (await res.json()).redis === "ready") return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`socket server on ${port} did not become healthy`);
}

function startGateway(index: number) {
  const port = BASE_PORT + index;
  startProcess(`gateway-${index}`, "dist/socket-server/index.mjs", { PORT: String(port), SOCKET_CORS_ORIGIN: "http://localhost:3000" });
  return waitForHealth(port);
}

// ---------------------------------------------------------------------------------------------
// Data: half the users in course groups of 10 (a teacher and 9 students), half in DM pairs.

type Member = { userId: string; conversationId: string };

async function seed(): Promise<{ members: Member[]; conversationMembers: Map<string, string[]> }> {
  const studentRole = await prisma.role.upsert({ where: { name: "STUDENT" }, create: { name: "STUDENT" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { name: "TEACHER" }, create: { name: "TEACHER" }, update: {} });
  const ids = Array.from({ length: USERS }, (_, i) => `load${RUN}u${i}`);
  await prisma.user.createMany({
    data: ids.map((id, i) => ({ id, email: `${id}@loadtest.invalid`, name: `Load User ${i}`, emailVerified: new Date() })),
  });

  const groupCount = Math.floor(USERS / 2 / GROUP_SIZE);
  const members: Member[] = [];
  const conversationMembers = new Map<string, string[]>();
  const roleRows: { userId: string; roleId: string }[] = [];

  for (let g = 0; g < groupCount; g++) {
    const groupIds = ids.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE);
    const [teacherId, ...studentIds] = groupIds;
    roleRows.push({ userId: teacherId, roleId: teacherRole.id }, ...studentIds.map((userId) => ({ userId, roleId: studentRole.id })));
    const course = await prisma.course.create({
      data: { title: `Load course ${g}`, slug: `load-${RUN}-${g}`, teacherId, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.enrollment.createMany({ data: studentIds.map((userId) => ({ userId, courseId: course.id, source: "PURCHASE" as const })) });
    const conversation = await prisma.conversation.create({
      data: {
        type: "COURSE_GROUP",
        courseId: course.id,
        uniqueKey: `course:${course.id}`,
        channel: "GENERAL",
        participants: { create: groupIds.map((userId, i) => ({ userId, role: i === 0 ? ("OWNER" as const) : ("MEMBER" as const) })) },
      },
    });
    conversationMembers.set(conversation.id, groupIds);
    groupIds.forEach((userId) => members.push({ userId, conversationId: conversation.id }));
  }

  const rest = ids.slice(groupCount * GROUP_SIZE);
  for (let p = 0; p + 1 < rest.length; p += 2) {
    const [a, b] = [rest[p], rest[p + 1]];
    roleRows.push({ userId: a, roleId: studentRole.id }, { userId: b, roleId: studentRole.id });
    const conversation = await prisma.conversation.create({
      data: { type: "DIRECT", uniqueKey: `direct:${[a, b].sort().join(":")}`, participants: { create: [{ userId: a }, { userId: b }] } },
    });
    conversationMembers.set(conversation.id, [a, b]);
    members.push({ userId: a, conversationId: conversation.id }, { userId: b, conversationId: conversation.id });
  }
  await prisma.userRole.createMany({ data: roleRows, skipDuplicates: true });
  return { members, conversationMembers };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { id: { startsWith: `load${RUN}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.conversation.deleteMany({ where: { participants: { some: { userId: { in: ids } } } } });
  await prisma.course.deleteMany({ where: { teacherId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

// ---------------------------------------------------------------------------------------------
// Clients: the same protocol as the browser (src/components/chat/use-chat-thread.ts).

type Sample = { latencyMs: number; viaSync: boolean };

class LoadClient {
  socket: Socket;
  seen = new Set<number>();
  maxSeq = 0;
  pending = new Map<string, { content: string; sentAt: number }>();
  sent = 0;
  acked = 0;
  ackLatencies: number[] = [];
  samples: Sample[] = [];
  reconnects = 0;
  disconnectedAt: number | null = null;
  reconnectTimes: number[] = [];
  syncing = false;

  constructor(
    readonly index: number,
    readonly member: Member,
    readonly node: number
  ) {
    this.socket = io(`http://127.0.0.1:${BASE_PORT + node}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      auth: (cb) => cb({ token: createSocketToken(member.userId, secret!) }),
    });
    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", () => {
      this.disconnectedAt ??= Date.now();
    });
    this.socket.on("message:new", (m: WireMessage) => this.receive([m], false));
  }

  private onConnect() {
    if (this.disconnectedAt !== null) {
      this.reconnects++;
      this.reconnectTimes.push(Date.now() - this.disconnectedAt);
      this.disconnectedAt = null;
    }
    this.socket.emit("conversation:join", this.member.conversationId, () => {});
    this.socket.emit("conversation:viewing", this.member.conversationId);
    if (this.maxSeq > 0 && !this.socket.recovered) this.sync();
    for (const [clientMsgId, p] of this.pending) this.transmit(clientMsgId, p.content);
  }

  receive(messages: WireMessage[], viaSync: boolean) {
    const now = Date.now();
    for (const m of messages) {
      if (this.seen.has(m.seq)) continue;
      this.seen.add(m.seq);
      if (m.seq > this.maxSeq) {
        if (m.seq > this.maxSeq + 1 && !viaSync) this.sync();
        this.maxSeq = m.seq;
      }
      if (m.senderId !== this.member.userId) {
        const sentAt = Number(/t=(\d+)/.exec(m.content)?.[1]);
        if (sentAt) this.samples.push({ latencyMs: now - sentAt, viaSync });
      }
    }
  }

  sync(lastSeq = this.maxSeq) {
    if (this.syncing || !this.socket.connected) return;
    this.syncing = true;
    this.socket
      .timeout(15_000)
      .emit("sync", { conversationId: this.member.conversationId, lastSeq }, (err: Error | null, result?: { messages?: WireMessage[]; reset?: boolean; error?: string }) => {
        this.syncing = false;
        if (err || !result || result.error) return;
        this.receive(result.messages ?? [], true);
        if (result.reset) this.fullSync();
      });
  }

  /** Pages through the whole history, the way a client that lost track would. */
  async fullSync() {
    let from = 0;
    for (;;) {
      const result = (await this.socket
        .timeout(20_000)
        .emitWithAck("sync", { conversationId: this.member.conversationId, lastSeq: from })
        .catch(() => null)) as { messages?: WireMessage[]; reset?: boolean } | null;
      if (!result || !result.messages?.length) return;
      this.receive(result.messages, true);
      if (!result.reset) return;
      from = result.messages[result.messages.length - 1].seq;
    }
  }

  transmit(clientMsgId: string, content: string) {
    this.socket
      .timeout(10_000)
      .emit("message:send", { conversationId: this.member.conversationId, clientMsgId, content }, (err: Error | null, result?: { message?: WireMessage; error?: string }) => {
        const p = this.pending.get(clientMsgId);
        if (!p) return;
        if (err) return; // retried on reconnect, or by the stale-pending sweep
        if (result?.message) {
          this.pending.delete(clientMsgId);
          this.acked++;
          this.ackLatencies.push(Date.now() - p.sentAt);
          this.receive([result.message], false);
        } else if (/too fast|Slow mode/.test(result?.error ?? "")) {
          setTimeout(() => this.transmit(clientMsgId, content), 1500);
        } else {
          console.error(`send refused for client ${this.index}: ${result?.error}`);
          this.pending.delete(clientMsgId);
        }
      });
  }

  sendOne() {
    const sentAt = Date.now();
    const clientMsgId = randomUUID();
    const content = `load t=${sentAt} c=${this.index} n=${this.sent}`;
    this.sent++;
    this.pending.set(clientMsgId, { content, sentAt });
    if (this.socket.connected) this.transmit(clientMsgId, content);
  }

  retryStale() {
    if (!this.socket.connected) return;
    const now = Date.now();
    for (const [clientMsgId, p] of this.pending) if (now - p.sentAt > 12_000) this.transmit(clientMsgId, p.content);
  }
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`Run ${RUN}: ${USERS} users, ${NODES} socket node(s), ${DURATION_S}s${RESTART ? ", killing node 0 mid-run" : ""}`);
  const { members, conversationMembers } = await seed();
  console.log(`Seeded ${members.length} members in ${conversationMembers.size} conversations.`);

  await Promise.all(Array.from({ length: NODES }, (_, i) => startGateway(i)));
  startProcess("worker", "dist/worker/index.mjs", {});

  const clients = members.map((m, i) => new LoadClient(i, m, i % NODES));
  const connectStart = Date.now();
  while (clients.some((c) => !c.socket.connected)) {
    if (Date.now() - connectStart > 60_000) throw new Error("clients did not all connect");
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`${clients.length} sockets connected in ${Date.now() - connectStart} ms.`);
  await new Promise((r) => setTimeout(r, 1000)); // joins settle

  const startedAt = Date.now();
  const timers = clients.map((c) => {
    const schedule = () =>
      setTimeout(() => {
        if (Date.now() - startedAt >= DURATION_S * 1000) return;
        c.sendOne();
        timer.ref = schedule();
      }, SEND_MIN_MS + Math.random() * (SEND_MAX_MS - SEND_MIN_MS));
    const timer = { ref: schedule() };
    return timer;
  });
  const staleSweep = setInterval(() => clients.forEach((c) => c.retryStale()), 3000);

  let restartReport: { killedAt: number; backAt: number } | null = null;
  if (RESTART) {
    setTimeout(async () => {
      const killedAt = Date.now();
      console.log("Killing gateway-0 (no graceful shutdown)...");
      children.get("gateway-0")?.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 2000));
      await startGateway(0);
      restartReport = { killedAt, backAt: Date.now() };
      console.log(`gateway-0 back after ${restartReport.backAt - killedAt} ms.`);
    }, (DURATION_S * 1000) / 2);
  }

  await new Promise((r) => setTimeout(r, DURATION_S * 1000));
  timers.forEach((t) => clearTimeout(t.ref));
  console.log("Sending stopped; waiting for outstanding acks...");
  const drainStart = Date.now();
  while (clients.some((c) => c.pending.size > 0) && Date.now() - drainStart < 45_000) {
    clients.forEach((c) => c.retryStale());
    await new Promise((r) => setTimeout(r, 500));
  }
  clearInterval(staleSweep);
  await new Promise((r) => setTimeout(r, 3000));

  // Final reconciliation: every member must hold every seq of their conversation.
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: [...conversationMembers.keys()] } },
    select: { id: true, lastSeq: true },
  });
  const lastSeqOf = new Map(conversations.map((c) => [c.id, c.lastSeq]));
  const missingLive = clients.reduce((sum, c) => sum + Math.max(0, (lastSeqOf.get(c.member.conversationId) ?? 0) - c.seen.size), 0);
  for (let i = 0; i < clients.length; i += 50) await Promise.all(clients.slice(i, i + 50).map((c) => c.fullSync()));
  let lostDeliveries = 0;
  for (const c of clients) {
    const last = lastSeqOf.get(c.member.conversationId) ?? 0;
    for (let seq = 1; seq <= last; seq++) if (!c.seen.has(seq)) lostDeliveries++;
  }

  const sent = clients.reduce((s, c) => s + c.sent, 0);
  const acked = clients.reduce((s, c) => s + c.acked, 0);
  const unacked = clients.reduce((s, c) => s + c.pending.size, 0);
  const stored = await prisma.message.count({ where: { conversationId: { in: [...conversationMembers.keys()] } } });
  const samples = clients.flatMap((c) => c.samples);
  const all = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const live = samples.filter((s) => !s.viaSync).map((s) => s.latencyMs).sort((a, b) => a - b);
  const acks = clients.flatMap((c) => c.ackLatencies).sort((a, b) => a - b);
  const under1s = all.filter((ms) => ms < 1000).length / Math.max(1, all.length);
  const reconnectTimes = clients.flatMap((c) => c.reconnectTimes).sort((a, b) => a - b);
  const expectedDeliveries = [...conversationMembers.entries()].reduce((sum, [id, users]) => sum + (lastSeqOf.get(id) ?? 0) * (users.length - 1), 0);

  const report = {
    run: RUN,
    users: USERS,
    nodes: NODES,
    durationS: DURATION_S,
    restart: restartReport,
    messagesSent: sent,
    messagesAcked: acked,
    messagesStored: stored,
    sendsNeverAcked: unacked,
    duplicateStores: Math.max(0, stored - sent),
    deliveries: { expected: expectedDeliveries, measured: all.length, live: live.length, viaSync: all.length - live.length },
    deliveryLatencyMs: { p50: percentile(all, 50), p95: percentile(all, 95), p99: percentile(all, 99), max: all.at(-1) ?? 0 },
    liveDeliveryLatencyMs: { p50: percentile(live, 50), p95: percentile(live, 95), p99: percentile(live, 99) },
    deliveredUnder1s: `${(under1s * 100).toFixed(2)}%`,
    ackLatencyMs: { p50: percentile(acks, 50), p95: percentile(acks, 95), p99: percentile(acks, 99) },
    missingBeforeFinalSync: missingLive,
    lostDeliveries,
    lostMessages: sent - stored,
    reconnects: { clients: reconnectTimes.length, p50Ms: percentile(reconnectTimes, 50), p95Ms: percentile(reconnectTimes, 95), maxMs: reconnectTimes.at(-1) ?? 0 },
    gate: {
      "95% under 1s": under1s >= 0.95,
      "none lost": lostDeliveries === 0 && sent === stored && unacked === 0,
    },
  };
  console.log(JSON.stringify(report, null, 2));

  clients.forEach((c) => c.socket.disconnect());
  for (const child of children.values()) child.kill();
  if (!arg("keep", false)) await cleanup();
  await prisma.$disconnect();
  process.exit(report.gate["95% under 1s"] && report.gate["none lost"] ? 0 : 2);
}

main().catch(async (err) => {
  console.error(err);
  for (const child of children.values()) child.kill();
  await cleanup().catch(() => {});
  process.exit(1);
});
