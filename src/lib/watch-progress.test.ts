import { describe, expect, it } from "vitest";
import { creditWatchTime, isWatchedEnough, resumePosition } from "./watch-progress";

const report = (over: Partial<Parameters<typeof creditWatchTime>[0]>) =>
  creditWatchTime({ previousPositionSec: 0, positionSec: 15, previousWatchedSec: 0, elapsedSec: 15, durationSec: 600, ...over });

describe("creditWatchTime", () => {
  it("credits normal playback in full", () => {
    expect(report({})).toEqual({ credited: 15, watchedSec: 15 });
  });

  it("allows up to 2x speed plus a little slack", () => {
    expect(report({ positionSec: 30 }).credited).toBe(30);
    expect(report({ positionSec: 40 }).credited).toBe(35);
  });

  it("caps a faked jump to the end by the real time that passed", () => {
    expect(report({ positionSec: 600, elapsedSec: 1 })).toEqual({ credited: 7, watchedSec: 7 });
  });

  it("credits nothing for seeking back, and never past the video's length", () => {
    expect(report({ previousPositionSec: 300, positionSec: 100 }).credited).toBe(0);
    expect(report({ previousWatchedSec: 595, positionSec: 30 }).watchedSec).toBe(600);
  });

  it("ignores a clock that went backwards", () => {
    expect(report({ elapsedSec: -100, positionSec: 100 }).credited).toBe(5);
  });
});

describe("isWatchedEnough", () => {
  it("completes at 90% of a known length", () => {
    expect(isWatchedEnough(539, 600)).toBe(false);
    expect(isWatchedEnough(540, 600)).toBe(true);
  });

  it("never auto-completes without a known length", () => {
    expect(isWatchedEnough(10_000, null)).toBe(false);
    expect(isWatchedEnough(10, 0)).toBe(false);
  });
});

describe("resumePosition", () => {
  it("resumes where the student stopped, or the link's start time on a first watch", () => {
    expect(resumePosition(120, 600, null)).toBe(120);
    expect(resumePosition(0, 600, 42)).toBe(42);
  });

  it("starts over after a finished video", () => {
    expect(resumePosition(590, 600, null)).toBe(0);
  });
});
