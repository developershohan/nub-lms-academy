import { describe, expect, it } from "vitest";
import { mergeMessages, newestSeq, type ChatMessage } from "./use-chat-thread";

const message = (seq: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${seq}`,
  seq,
  conversationId: "c1",
  senderId: "u1",
  clientMsgId: null,
  content: `message ${seq}`,
  createdAt: new Date(2026, 9, 18, 10, seq).toISOString(),
  deletedAt: null,
  sender: { id: "u1", name: "Amina" },
  ...extra,
});

describe("mergeMessages", () => {
  it("keeps messages in seq order, whatever order they arrive in", () => {
    expect(mergeMessages([message(1), message(3)], [message(2)]).map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("ignores a message it already has - a live event and a catch-up can both deliver it", () => {
    expect(mergeMessages([message(1), message(2)], [message(2)])).toHaveLength(2);
  });

  it("swaps the pending copy for the saved one, matched by clientMsgId", () => {
    const pending = message(0, { id: "pending:abc", clientMsgId: "abc", pending: true });
    const merged = mergeMessages([message(1), pending], [message(2, { clientMsgId: "abc" })]);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("keeps pending and failed messages after everything saved", () => {
    const pending = message(0, { id: "pending:x", clientMsgId: "x", pending: true });
    expect(mergeMessages([pending], [message(5)]).map((m) => m.id)).toEqual(["m5", "pending:x"]);
    expect(newestSeq([message(5), pending])).toBe(5);
  });
});
