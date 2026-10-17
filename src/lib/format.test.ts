import { describe, expect, it } from "vitest";
import {
  formatHoursOfContent,
  formatLessonDuration,
  formatMoney,
  formatPrice,
  formatRelativeDate,
  formatTotalDuration,
  parseLessonDuration,
} from "./format";

describe("formatTotalDuration", () => {
  it("shows hours and minutes for course and section totals", () => {
    expect(formatTotalDuration(58 * 60)).toBe("58m");
    expect(formatTotalDuration(4 * 3600 + 35 * 60)).toBe("4h 35m");
    expect(formatTotalDuration(2 * 3600)).toBe("2h");
    expect(formatTotalDuration(20)).toBe("under 1m");
  });
});

describe("formatLessonDuration", () => {
  it("shows a clock-style length per lesson", () => {
    expect(formatLessonDuration(480)).toBe("8:00");
    expect(formatLessonDuration(65)).toBe("1:05");
    expect(formatLessonDuration(3725)).toBe("1:02:05");
  });
});

describe("formatHoursOfContent", () => {
  it("rounds to the nearest half hour, and uses minutes under an hour", () => {
    expect(formatHoursOfContent(58 * 60)).toBe("58 minutes");
    expect(formatHoursOfContent(3600)).toBe("1 hour");
    expect(formatHoursOfContent(5.3 * 3600)).toBe("5.5 hours");
  });
});

describe("formatPrice", () => {
  it("shows free courses as Free", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(29.9)).toBe("$29.90");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("describes review dates in rough terms", () => {
    expect(formatRelativeDate(daysAgo(0), now)).toBe("today");
    expect(formatRelativeDate(daysAgo(1), now)).toBe("yesterday");
    expect(formatRelativeDate(daysAgo(10), now)).toBe("1 week ago");
    expect(formatRelativeDate(daysAgo(65), now)).toBe("2 months ago");
    expect(formatRelativeDate(daysAgo(800), now)).toBe("2 years ago");
  });
});

describe("parseLessonDuration", () => {
  it("reads clock times and bare minutes into seconds", () => {
    expect(parseLessonDuration("12:30")).toBe(750);
    expect(parseLessonDuration(" 1:02:05 ")).toBe(3725);
    expect(parseLessonDuration("90:00")).toBe(5400);
    expect(parseLessonDuration("12")).toBe(720);
  });

  it("round-trips what formatLessonDuration shows in the curriculum", () => {
    for (const sec of [5, 480, 3725]) expect(parseLessonDuration(formatLessonDuration(sec))).toBe(sec);
  });

  it("rejects text that isn't a length", () => {
    for (const text of ["", "abc", "12:5", "12:60", "1:60:00", "-5", "1.5"]) {
      expect(parseLessonDuration(text)).toBeNull();
    }
  });
});

describe("formatMoney", () => {
  it("always shows an amount, never Free", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });
});
