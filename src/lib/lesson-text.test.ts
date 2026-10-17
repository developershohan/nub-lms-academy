import { describe, expect, it } from "vitest";
import { parseLessonText, readingMinutes } from "./lesson-text";

describe("parseLessonText", () => {
  it("splits paragraphs on blank lines and keeps single line breaks inside a paragraph", () => {
    expect(parseLessonText("First line\nstill first paragraph\n\n\nSecond paragraph\r\n")).toEqual([
      { kind: "paragraph", text: "First line\nstill first paragraph" },
      { kind: "paragraph", text: "Second paragraph" },
    ]);
  });

  it("turns '#' lines into headings and bullet or numbered lines into lists", () => {
    const text = [
      "# Setting up",
      "You need three things:",
      "- Node.js",
      "* a code editor",
      "• a browser",
      "",
      "## Steps",
      "1. Install Node",
      "2) Run npm init",
    ].join("\n");

    expect(parseLessonText(text)).toEqual([
      { kind: "heading", level: 2, text: "Setting up" },
      { kind: "paragraph", text: "You need three things:" },
      { kind: "list", ordered: false, items: ["Node.js", "a code editor", "a browser"] },
      { kind: "heading", level: 3, text: "Steps" },
      { kind: "list", ordered: true, items: ["Install Node", "Run npm init"] },
    ]);
  });

  it("leaves look-alikes as plain text", () => {
    expect(parseLessonText("#hashtag\n-5 degrees\n2026 was a good year")).toEqual([
      { kind: "paragraph", text: "#hashtag\n-5 degrees\n2026 was a good year" },
    ]);
  });

  it("starts a new list after a paragraph interrupts one", () => {
    expect(parseLessonText("- a\nnot an item\n- b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "paragraph", text: "not an item" },
      { kind: "list", ordered: false, items: ["b"] },
    ]);
  });

  it("returns nothing for empty content", () => {
    expect(parseLessonText(null)).toEqual([]);
    expect(parseLessonText("  \n\n ")).toEqual([]);
  });
});

describe("readingMinutes", () => {
  it("estimates at 200 words a minute, at least one minute", () => {
    expect(readingMinutes("")).toBe(0);
    expect(readingMinutes(null)).toBe(0);
    expect(readingMinutes("just a few words")).toBe(1);
    expect(readingMinutes(Array(1000).fill("word").join(" "))).toBe(5);
  });
});
