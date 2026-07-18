import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { createSocketToken, verifySocketToken } from "./socket-token";

const SECRET = "test-secret";

describe("socket-token", () => {
  it("round-trips a valid token", () => {
    const token = createSocketToken("user-123", SECRET);
    const result = verifySocketToken(token, SECRET);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSocketToken("user-123", SECRET);
    const result = verifySocketToken(token, "wrong-secret");
    expect(result).toEqual({ error: "bad_signature" });
  });

  it("rejects a malformed token", () => {
    expect(verifySocketToken("not-a-token", SECRET)).toEqual({ error: "malformed" });
    expect(verifySocketToken("", SECRET)).toEqual({ error: "malformed" });
  });

  it("rejects a tampered payload even with a matching-looking signature", () => {
    const token = createSocketToken("user-123", SECRET);
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ id: "attacker", exp: Date.now() + 60_000 })).toString(
      "base64url"
    );
    const tampered = `${tamperedPayload}.${signature}`;
    expect(verifySocketToken(tampered, SECRET)).toEqual({ error: "bad_signature" });
  });

  it("rejects an expired token", () => {
    const payload = Buffer.from(JSON.stringify({ id: "user-123", exp: Date.now() - 1000 })).toString("base64url");
    const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    const expired = `${payload}.${signature}`;
    expect(verifySocketToken(expired, SECRET)).toEqual({ error: "expired" });
  });
});
