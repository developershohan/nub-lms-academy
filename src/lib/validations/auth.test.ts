import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema, resetPasswordSchema } from "./auth";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    expect(registerSchema.safeParse({ name: "Ada", email: "ada@example.com", password: "password123" }).success).toBe(
      true
    );
  });

  it("rejects a short password", () => {
    const result = registerSchema.safeParse({ name: "Ada", email: "ada@example.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ name: "Ada", email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a non-empty password but does not enforce a minimum length", () => {
    // Login must never be stricter than what registration allowed historically - a min-length
    // check here would lock out real users with old, shorter passwords.
    expect(loginSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires email, token, and an 8+ character password together", () => {
    expect(
      resetPasswordSchema.safeParse({ email: "a@example.com", token: "abc", password: "password123" }).success
    ).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "abc", password: "password123" }).success).toBe(false);
  });
});
