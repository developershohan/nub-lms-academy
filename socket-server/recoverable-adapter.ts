// The Redis adapter, plus connection state recovery.
//
// Socket.IO's connectionStateRecovery needs a "session-aware" adapter: one that numbers every
// broadcast (an offset the client remembers) and keeps recent packets, so a client that drops for
// a few seconds gets exactly what it missed. The stock @socket.io/redis-adapter extends the plain
// Adapter, so with it recovery is silently never possible. This subclass keeps the Redis pub/sub
// behaviour unchanged and adds Socket.IO's own SessionAwareAdapter logic on each node:
//   - packets are published to other nodes WITHOUT an offset;
//   - every node, the sender's included, adds its own offset when it delivers locally and keeps
//     the packet for maxDisconnectionDuration.
// Recovery therefore works when a client reconnects to the same node within the window. After a
// node restart, or on another node, recovery fails and the client falls back to the chat `sync`
// protocol (seq-based gap fill), which is the guarantee messages rely on.
import { randomBytes } from "node:crypto";
import { RedisAdapter, type RedisAdapterOptions } from "@socket.io/redis-adapter";
import type { BroadcastOptions, PrivateSessionId, Room, Session } from "socket.io-adapter";

type Packet = { type: number; id?: number; nsp?: string; data: unknown[] };
type StoredPacket = { id: string; opts: BroadcastOptions; data: unknown[]; emittedAt: number };
type PersistedSession = Omit<Session, "missedPackets"> & { disconnectedAt: number };
type Parser = { encode(value: unknown): unknown; decode(value: unknown): unknown };

/** RedisAdapter fields the d.ts marks private; read here only to mirror its publish exactly. */
type RedisAdapterInternals = {
  uid: string;
  channel: string;
  parser: Parser;
  pubClient: { publish(channel: string, message: unknown): Promise<unknown> | unknown };
  hasRoom(room: string): boolean;
  nsp: { name: string };
};

// Adapter.prototype.broadcast: delivers to this node's sockets only.
const localBroadcast = Object.getPrototypeOf(RedisAdapter.prototype).broadcast as (
  this: RedisAdapter,
  packet: Packet,
  opts: BroadcastOptions
) => void;

function shouldIncludePacket(sessionRooms: Room[], opts: BroadcastOptions) {
  const included = opts.rooms.size === 0 || sessionRooms.some((room) => opts.rooms.has(room));
  const notExcluded = sessionRooms.every((room) => !opts.except?.has(room));
  return included && notExcluded;
}

export class RecoverableRedisAdapter extends RedisAdapter {
  private readonly sessions = new Map<PrivateSessionId, PersistedSession>();
  private readonly packets: StoredPacket[] = [];
  private readonly maxDisconnectionDuration: number;
  private readonly offsetPrefix = randomBytes(4).toString("hex");
  private offsetCounter = 0;

  constructor(nsp: unknown, pubClient: unknown, subClient: unknown, opts: Partial<RedisAdapterOptions> = {}) {
    super(nsp, pubClient, subClient, opts);
    const server = (nsp as { server: { opts: { connectionStateRecovery?: { maxDisconnectionDuration?: number } } } }).server;
    this.maxDisconnectionDuration = server.opts.connectionStateRecovery?.maxDisconnectionDuration ?? 2 * 60 * 1000;
    const timer = setInterval(() => this.expire(), 60 * 1000);
    timer.unref();
  }

  private expire() {
    const threshold = Date.now() - this.maxDisconnectionDuration;
    for (const [pid, session] of this.sessions) {
      if (session.disconnectedAt < threshold) this.sessions.delete(pid);
    }
    const firstFresh = this.packets.findIndex((p) => p.emittedAt >= threshold);
    this.packets.splice(0, firstFresh === -1 ? this.packets.length : firstFresh);
  }

  override persistSession(session: Omit<Session, "missedPackets">) {
    this.sessions.set(session.pid, { ...session, disconnectedAt: Date.now() });
  }

  override restoreSession(pid: PrivateSessionId, offset: string): Promise<Session> {
    const session = this.sessions.get(pid);
    if (!session || session.disconnectedAt + this.maxDisconnectionDuration < Date.now()) {
      this.sessions.delete(pid);
      return null as unknown as Promise<Session>;
    }
    const index = this.packets.findIndex((p) => p.id === offset);
    if (index === -1) return null as unknown as Promise<Session>;
    const missedPackets = this.packets.slice(index + 1).filter((p) => shouldIncludePacket(session.rooms, p.opts)).map((p) => p.data);
    const restored: Session = { sid: session.sid, pid: session.pid, rooms: session.rooms, data: session.data, missedPackets };
    return Promise.resolve(restored);
  }

  /** Delivers to this node's sockets, adding a recovery offset to plain (non-ack, non-volatile) events. */
  deliverLocally(packet: Packet, opts: BroadcastOptions) {
    const recoverable = packet.type === 2 && packet.id === undefined && opts.flags?.volatile === undefined;
    if (recoverable) {
      const id = `${this.offsetPrefix}-${(this.offsetCounter++).toString(36)}`;
      // The offset goes last in the event's arguments (Socket.IO's own format); handlers ignore it.
      packet.data.push(id);
      this.packets.push({ id, opts, data: packet.data, emittedAt: Date.now() });
    }
    localBroadcast.call(this, packet, opts);
  }

  override broadcast(packet: Packet, opts: BroadcastOptions) {
    const self = this as unknown as RedisAdapterInternals;
    packet.nsp = self.nsp.name;
    if (!opts.flags?.local) {
      // Same message and channel as RedisAdapter.broadcast, published before the offset is added.
      const rawOpts = { rooms: [...opts.rooms], except: [...new Set(opts.except ?? [])], flags: opts.flags };
      const message = self.parser.encode([self.uid, packet, rawOpts]);
      let channel = self.channel;
      if (opts.rooms && opts.rooms.size === 1) channel += `${opts.rooms.keys().next().value}#`;
      Promise.resolve(self.pubClient.publish(channel, message)).catch((err: unknown) =>
        console.error("Redis publish failed:", err instanceof Error ? err.message : err)
      );
    }
    this.deliverLocally(packet, opts);
  }
}

// RedisAdapter.onmessage (a packet from another node or from @socket.io/redis-emitter) is private
// in the type definitions, so it's replaced on the prototype instead of overridden. Same checks as
// the original, but the packet goes through deliverLocally so it gets an offset here too.
(RecoverableRedisAdapter.prototype as unknown as { onmessage: unknown }).onmessage = function onmessage(
  this: RecoverableRedisAdapter,
  _pattern: unknown,
  rawChannel: Buffer | string,
  message: Buffer
) {
  const self = this as unknown as RedisAdapterInternals;
  const channel = rawChannel.toString();
  if (!channel.startsWith(self.channel)) return;
  const room = channel.slice(self.channel.length, -1);
  if (room !== "" && !self.hasRoom(room)) return;
  const [uid, packet, opts] = self.parser.decode(message) as [string, Packet | undefined, { rooms: Room[]; except: Room[]; flags?: BroadcastOptions["flags"] }];
  if (uid === self.uid) return;
  if (packet && packet.nsp === undefined) packet.nsp = "/";
  if (!packet || packet.nsp !== self.nsp.name) return;
  this.deliverLocally(packet, { rooms: new Set(opts.rooms), except: new Set(opts.except), flags: opts.flags });
};

export function createRecoverableAdapter(pubClient: unknown, subClient: unknown, opts: Partial<RedisAdapterOptions> = {}) {
  // Socket.IO instantiates this with `new`, so it must be a real function, not an arrow function.
  return function recoverableAdapter(nsp: unknown) {
    return new RecoverableRedisAdapter(nsp, pubClient, subClient, opts);
  };
}
