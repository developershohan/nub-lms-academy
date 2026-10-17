import { describe, expect, it } from "vitest";
import { parseIsoDuration, parseTimestamp, parseYouTubeUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `http://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}?rel=0`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/v/${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ])("finds the video in %s", (url) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: ID, startSec: null });
  });

  it("reads the start time from t=, start= and #t=", () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)?.startSec).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSec).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=42`)?.startSec).toBe(42);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=1h2m3s`)?.startSec).toBe(3723);
  });

  it.each([
    "not a url",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/watch?v=too-short",
    "https://www.youtube.com/channel/UC123456789",
    "https://www.youtube.com/playlist?list=PL123",
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `javascript:alert('https://youtu.be/${ID}')`,
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it("reads seconds and h/m/s forms, and nothing else", () => {
    expect(parseTimestamp("75")).toBe(75);
    expect(parseTimestamp("75s")).toBe(75);
    expect(parseTimestamp("2m")).toBe(120);
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("parseIsoDuration", () => {
  it("reads the Data API's ISO 8601 durations", () => {
    expect(parseIsoDuration("PT4M13S")).toBe(253);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("nonsense")).toBeNull();
  });
});
