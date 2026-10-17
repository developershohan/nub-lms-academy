// The real-time path end to end on PostgreSQL and Redis: two in-process socket server nodes joined
// by the Redis adapter, real socket.io clients, the web app's Redis emitter and the job queue.
// Skipped when no Redis is available (see global-setup.ts).
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

// The other suites stub the web app's socket bridge; this one needs the real thing (Redis).
vi.unmock("@/lib/realtime");

import { prisma } from "@/lib/prisma";
import { realtimeBus } from "@/lib/realtime";
import { reconcileCourseGroups } from "@/server/chat/membership";
import { createRedisPresence } from "@/server/realtime/presence";
import { getQueue } from "@/server/realtime/queues";
import { getSharedRedis } from "@/server/realtime/redis";
import { notify } from "@/server/services/notification-service";
import { getOrCreateCourseGroupConversation, startDirectConversation } from "@/server/services/chat-service";
import { banUser } from "@/server/services/user-service";
import { refundOrder } from "@/server/services/order-service";
import { createCourse, createUser, resetDatabase } from "./db";
import { clientMsgId, collect, connectAs, connected, directConversation, eventually, flushRedis, join, nextEvent, send, startGateway, stopAll } from "./realtime-helpers";

const redisUrl = inject("redisUrl");

type Message = { seq: number; content: string; conversationId: string; id: string };
type Update = { conversationId: string; unread?: number; lastSeq?: number; preview?: string };

describe.skipIf(!redisUrl)("real-time socket server on Redis", () => {
  beforeEach(async () => {
    await resetDatabase();
    await flushRedis(redisUrl!);
  });
  afterEach(async () => {
    await stopAll();
  });

  async function dmPair() {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id);
    await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
    const dm = await directConversation(teacher.id, student.id);
    return { teacher, student, course, dm };
  }

  it("delivers across nodes: ack with the saved message, message:new to the room, unread to each member", async () => {
    const { teacher, student, dm } = await dmPair();
    const nodeA = await startGateway(redisUrl);
    const nodeB = await startGateway(redisUrl);
    const sender = connectAs(nodeA.url, student.id);
    const receiver = connectAs(nodeB.url, teacher.id);
    await Promise.all([connected(sender), connected(receiver)]);
    await join(sender, dm.id);
    await join(receiver, dm.id);

    const incoming = nextEvent<Message>(receiver, "message:new");
    const update = nextEvent<Update>(receiver, "conversation:updated", (u) => u.conversationId === dm.id && u.unread !== undefined);
    const started = Date.now();
    const ack = await send(sender, dm.id, "hello from node A");

    expect(ack).toMatchObject({ message: { seq: 1, content: "hello from node A" } });
    await expect(incoming).resolves.toMatchObject({ conversationId: dm.id, seq: 1, content: "hello from node A" });
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(update).resolves.toMatchObject({ lastSeq: 1, unread: 1, preview: "hello from node A" });
  });

  it("never stores a retried send twice, even across a reconnect", async () => {
    const { student, dm } = await dmPair();
    const node = await startGateway(redisUrl);
    const socket = connectAs(node.url, student.id);
    await connected(socket);
    const id = clientMsgId();

    const first = await send(socket, dm.id, "once", id);
    socket.disconnect().connect();
    await connected(socket);
    const retry = await send(socket, dm.id, "once", id);

    expect(retry.message?.id).toBe(first.message?.id);
    await expect(prisma.message.count({ where: { conversationId: dm.id } })).resolves.toBe(1);
  });

  it("fills the gap with sync after a client was offline, including edits made meanwhile", async () => {
    const { teacher, student, dm } = await dmPair();
    const node = await startGateway(redisUrl);
    const sender = connectAs(node.url, teacher.id);
    const reader = connectAs(node.url, student.id);
    await Promise.all([connected(sender), connected(reader)]);
    await join(reader, dm.id);
    const firstArrived = nextEvent(reader, "message:new");
    const first = await send(sender, dm.id, "m1");
    await firstArrived;
    const since = new Date().toISOString();

    reader.disconnect();
    for (const body of ["m2", "m3", "m4"]) await send(sender, dm.id, body);
    await new Promise((r) => setTimeout(r, 5));
    await sender.timeout(5_000).emitWithAck("message:edit", { messageId: first.message!.id, content: "m1 (edited)" });
    reader.connect();
    await connected(reader);
    const result = (await reader.timeout(5_000).emitWithAck("sync", { conversationId: dm.id, lastSeq: 1, since })) as {
      messages: Message[];
      changed: Message[];
      reset: boolean;
    };

    expect(result.reset).toBe(false);
    expect(result.messages.map((m) => [m.seq, m.content])).toEqual([
      [2, "m2"],
      [3, "m3"],
      [4, "m4"],
    ]);
    expect(result.changed).toEqual([expect.objectContaining({ seq: 1, content: "m1 (edited)" })]);
  });

  it("recovers a short drop on the same node: rooms restored and missed events replayed", async () => {
    const { teacher, student, dm } = await dmPair();
    const node = await startGateway(redisUrl);
    const sender = connectAs(node.url, teacher.id);
    const reader = connectAs(node.url, student.id);
    await Promise.all([connected(sender), connected(reader)]);
    await join(reader, dm.id);
    // An event first, so the client holds a recovery offset.
    const before = nextEvent(reader, "message:new");
    await send(sender, dm.id, "before");
    await before;

    const missed = nextEvent<Message>(reader, "message:new", (m) => m.content === "while away", 8_000);
    // Kill the transport without a clean close, like a network drop.
    reader.io.engine.close();
    await eventually(() => !reader.connected);
    await send(sender, dm.id, "while away");
    await connected(reader, 8_000);

    expect(reader.recovered).toBe(true);
    await expect(missed).resolves.toMatchObject({ seq: 2 });
  });

  it("disconnects a banned user at once, on whichever node they are, and refuses the reconnect", async () => {
    const admin = await createUser(["ADMIN"]);
    const { student } = await dmPair();
    await startGateway(redisUrl);
    const nodeB = await startGateway(redisUrl);
    const socket = connectAs(nodeB.url, student.id);
    await connected(socket);
    const kicked = new Promise<string>((resolve) => socket.once("disconnect", resolve));

    await expect(banUser(admin.id, student.id, "spam")).resolves.toEqual({ ok: true });

    await expect(kicked).resolves.toBe("io server disconnect");
    const refused = new Promise<string>((resolve) => socket.once("connect_error", (err) => resolve(err.message)));
    socket.connect();
    await expect(refused).resolves.toBe("Unauthorized");
  });

  it("rate-limits a flood from one user across their tabs", async () => {
    const { student, dm } = await dmPair();
    const node = await startGateway(redisUrl);
    const tab1 = connectAs(node.url, student.id);
    const tab2 = connectAs(node.url, student.id);
    await Promise.all([connected(tab1), connected(tab2)]);

    const acks = await Promise.all(Array.from({ length: 30 }, (_, i) => send(i % 2 ? tab1 : tab2, dm.id, `flood ${i}`)));

    const refused = acks.filter((a) => a.error);
    expect(refused.length).toBeGreaterThanOrEqual(9);
    expect(refused[0]).toMatchObject({ error: expect.stringMatching(/too fast/) });
  });

  it("relays typing only inside the room and never to the typist", async () => {
    const { teacher, student, dm } = await dmPair();
    const outsider = await createUser();
    const node = await startGateway(redisUrl);
    const a = connectAs(node.url, student.id);
    const b = connectAs(node.url, teacher.id);
    const c = connectAs(node.url, outsider.id);
    await Promise.all([connected(a), connected(b), connected(c)]);
    await join(a, dm.id);
    await join(b, dm.id);
    const outsiderSaw = collect(c, "typing:start");
    const selfSaw = collect(a, "typing:start");

    a.emit("typing:start", dm.id);
    await expect(nextEvent(b, "typing:start")).resolves.toMatchObject({ userId: student.id });
    // The outsider can't inject typing into a room it never joined.
    c.emit("typing:start", dm.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(outsiderSaw).toEqual([]);
    expect(selfSaw).toEqual([]);
  });

  it("pushes the full notification to every tab of the user at once and queues email and push for the worker", async () => {
    const user = await createUser();
    const nodeA = await startGateway(redisUrl);
    const nodeB = await startGateway(redisUrl);
    const tab1 = connectAs(nodeA.url, user.id);
    const tab2 = connectAs(nodeB.url, user.id);
    await Promise.all([connected(tab1), connected(tab2)]);
    const delivery = getQueue("delivery")!;
    await delivery.obliterate({ force: true });

    const received = Promise.all([nextEvent<{ notification: { id: string } }>(tab1, "notification:new"), nextEvent<{ notification: { id: string } }>(tab2, "notification:new")]);
    await notify([user.id], { type: "payment", title: "Payment received", body: "You're enrolled in Web Basics.", link: "/student/my-courses" });

    const [first, second] = await received;
    expect(first).toMatchObject({ notification: { title: "Payment received", status: "UNREAD" }, unreadCount: 1 });
    expect(second.notification.id).toBe(first.notification.id);
    await expect(prisma.notification.count({ where: { userId: user.id } })).resolves.toBe(1);
    // "payments" defaults to email and push; with Redis both go to the worker's queue.
    const jobs = await delivery.getJobs(["waiting", "delayed"]);
    expect(jobs.map((j) => j.name).sort()).toEqual(["email", "push"]);
  });

  it("notifies members who aren't looking, never the one who has the chat on screen on another node", async () => {
    const teacher = await createUser(["TEACHER"]);
    const watching = await createUser();
    const away = await createUser();
    const sender = await createUser();
    const course = await createCourse(teacher.id);
    for (const u of [watching, away, sender]) await prisma.enrollment.create({ data: { userId: u.id, courseId: course.id, source: "PURCHASE" } });
    for (const u of [teacher, watching, away, sender]) await reconcileCourseGroups(realtimeBus, u.id);
    const group = await getOrCreateCourseGroupConversation(sender.id, course.id);
    if (!group.ok) throw new Error(group.error);

    const nodeA = await startGateway(redisUrl);
    const nodeB = await startGateway(redisUrl);
    const senderSocket = connectAs(nodeA.url, sender.id);
    const watcher = connectAs(nodeB.url, watching.id);
    const awaySocket = connectAs(nodeB.url, away.id);
    await Promise.all([connected(senderSocket), connected(watcher), connected(awaySocket)]);
    // Sent back to back, as a client may: "viewing" must still count once the join lands.
    const joined = join(watcher, group.conversationId);
    watcher.emit("conversation:viewing", group.conversationId);
    await joined;
    const presence = createRedisPresence(getSharedRedis()!);
    await eventually(async () => (await presence.viewing([{ userId: watching.id, conversationId: group.conversationId }]))[0]);

    const alert = nextEvent<{ notification: { type: string } }>(awaySocket, "notification:new");
    await send(senderSocket, group.conversationId, "first");
    await send(senderSocket, group.conversationId, "second");

    await expect(alert).resolves.toMatchObject({ notification: { type: "message" } });
    await eventually(async () => (await prisma.notification.findMany({ where: { groupKey: `conversation:${group.conversationId}` } })).every((r) => (r.data as { count: number }).count === 2));
    const rows = await prisma.notification.findMany({ where: { groupKey: `conversation:${group.conversationId}` } });
    // One collapsed row each for the absent teacher and student; nothing for the watcher or the sender.
    expect(rows.map((r) => r.userId).sort()).toEqual([away.id, teacher.id].sort());
  });

  it("takes a refunded student out of the course channels live", async () => {
    const admin = await createUser(["ADMIN"]);
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id, { price: 0 });
    const order = await prisma.order.create({
      data: { userId: student.id, status: "PAID", subtotal: 0, total: 0, items: { create: [{ courseId: course.id, price: 0 }] } },
    });
    await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
    await reconcileCourseGroups(realtimeBus, student.id);
    const general = await prisma.conversation.findUniqueOrThrow({ where: { uniqueKey: `course:${course.id}` } });

    const node = await startGateway(redisUrl);
    const socket = connectAs(node.url, student.id);
    await connected(socket);
    await join(socket, general.id);
    const removed = nextEvent<{ conversationId: string }>(socket, "conversation:removed", (p) => p.conversationId === general.id);

    await expect(refundOrder(admin.id, order.id)).resolves.toEqual({ ok: true });

    await expect(removed).resolves.toEqual({ conversationId: general.id });
    await expect(send(socket, general.id, "still here?")).resolves.toMatchObject({ error: "Forbidden" });
    await expect(startDirectConversation(student.id, teacher.id)).resolves.toMatchObject({ error: expect.stringMatching(/only message/) });
  });
});
