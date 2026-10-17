import { describe, expect, it } from "vitest";
import { quizSettingsSchema } from "./quiz";

const base = { title: "Week 1 quiz", passingScore: "70" };

describe("quizSettingsSchema", () => {
  it("treats a blank time limit as no time limit, not as 0 seconds", () => {
    const result = quizSettingsSchema.safeParse({ ...base, timeLimitSec: "", maxAttempts: "" });
    expect(result.success).toBe(true);
    expect(result.data?.timeLimitSec).toBeUndefined();
    expect(result.data?.maxAttempts).toBeUndefined();
  });

  it("accepts a positive time limit and attempt cap", () => {
    const data = quizSettingsSchema.parse({ ...base, timeLimitSec: "600", maxAttempts: "3" });
    expect(data.timeLimitSec).toBe(600);
    expect(data.maxAttempts).toBe(3);
  });

  it("rejects a zero time limit", () => {
    expect(quizSettingsSchema.safeParse({ ...base, timeLimitSec: "0" }).success).toBe(false);
  });
});
