// How server code reaches connected browsers, whichever process it runs in. The socket server
// implements it on its own `io`; Next.js and the worker implement it with the Redis emitter
// (src/lib/realtime.ts), which every socket node picks up through the Redis adapter.
export interface RealtimeBus {
  emit(room: string | string[], event: string, payload?: unknown): void;
  /** Closes every socket a user has open, on every node. Their reconnect re-authenticates. */
  disconnectUser(userId: string): void;
  /** Takes all of a user's sockets out of a room (a course channel they lost access to). */
  removeUserFromRoom(userId: string, room: string): void;
  /** Tells every socket node to drop its cached permissions for this user. */
  invalidateUser(userId: string): void;
}

export const noopBus: RealtimeBus = {
  emit() {},
  disconnectUser() {},
  removeUserFromRoom() {},
  invalidateUser() {},
};

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  /** Every connected ADMIN, SUPER_ADMIN and SUPPORT socket - the shared support queue. */
  staff: "staff:support",
};
