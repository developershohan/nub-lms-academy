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

  it("turns the studio's minutes into seconds, and a blank minutes field into no limit", () => {
    expect(quizSettingsSchema.parse({ ...base, timeLimitMin: "1.5" }).timeLimitSec).toBe(90);
    expect(quizSettingsSchema.parse({ ...base, timeLimitMin: "" }).timeLimitSec).toBeUndefined();
  });

  it("reads ticked and unticked checkboxes", () => {
    const data = quizSettingsSchema.parse({ ...base, shuffleQuestions: "on" });
    expect(data.shuffleQuestions).toBe(true);
    expect(!!data.partialCredit).toBe(false);
  });

  it("requires a positive draw count and cooldown when given", () => {
    expect(quizSettingsSchema.safeParse({ ...base, drawCount: "0" }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ ...base, retakeCooldownMin: "0" }).success).toBe(false);
    expect(quizSettingsSchema.parse({ ...base, drawCount: "", retakeCooldownMin: "" })).toMatchObject({
      drawCount: undefined,
      retakeCooldownMin: undefined,
    });
  });
});
