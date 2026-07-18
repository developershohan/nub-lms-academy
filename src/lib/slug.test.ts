import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

const noConflicts = async () => false;

describe("slugify", () => {
  it("lowercases, trims, and hyphenates", async () => {
    expect(await slugify("  Intro to React  ", noConflicts)).toBe("intro-to-react");
  });

  it("strips non-alphanumeric characters", async () => {
    expect(await slugify("C++ & Data Structures!", noConflicts)).toBe("c-data-structures");
  });

  it("falls back to 'item' when nothing alphanumeric remains", async () => {
    expect(await slugify("!!!", noConflicts)).toBe("item");
  });

  it("appends an incrementing suffix until the callback reports no conflict", async () => {
    const taken = new Set(["intro-to-react", "intro-to-react-2", "intro-to-react-3"]);
    const exists = async (candidate: string) => taken.has(candidate);
    expect(await slugify("Intro to React", exists)).toBe("intro-to-react-4");
  });
});
