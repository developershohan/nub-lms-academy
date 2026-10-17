import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import {
  createBengaliFont,
  layoutTitle,
  renderCertificatePdf,
  splitScriptRuns,
  truncateToWidth,
  wrapText,
} from "./certificate-pdf";

const charWidth = (text: string) => [...text].length;
// fontkit glyphs carry their PostScript name at runtime; the bundled typings just don't declare it.
const glyphNames = (glyphs: unknown[]) => glyphs.map((glyph) => (glyph as { name: string }).name);

describe("renderCertificatePdf", () => {
  it("renders Bengali names and titles instead of throwing on WinAnsi encoding", async () => {
    const bytes = await renderCertificatePdf({
      certificateNumber: "NUB-ABC123",
      studentName: "মোঃ রহিম উদ্দিন",
      courseTitle:
        "ওয়েব ডেভেলপমেন্ট বুটক্যাম্প: Full-Stack JavaScript with React, Node.js, Express and MongoDB for Absolute Beginners — একদম শুরু থেকে",
      teacherName: "শিক্ষক Karim",
      completedAt: new Date("2026-10-01T00:00:00Z"),
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const fontNames = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font"))
      .map((font) => font.get(PDFName.of("BaseFont"))?.toString() ?? "");
    // Latin runs are embedded Noto Sans text; Bengali runs are drawn as outlines (no font object).
    expect(fontNames.some((name) => name.includes("NotoSans"))).toBe(true);
    expect(fontNames.some((name) => name.includes("Helvetica"))).toBe(false);
  });
});

describe("createBengaliFont", () => {
  it("still shapes cleanly after outlines were read (no dotted-circle broken clusters)", () => {
    const font = createBengaliFont(readFileSync(path.join(process.cwd(), "src/assets/fonts/NotoSansBengali-Bold.ttf")));
    // Drawing "রহিম" first used to poison fontkit's glyph cache, so "বু" then shaped as a broken
    // cluster - see the comment on createBengaliFont.
    for (const word of ["মোঃ রহিম উদ্দিন", "ওয়েব ডেভেলপমেন্ট বুটক্যাম্প", "একদম শুরু থেকে শিক্ষা"]) {
      const { glyphs } = font.layout(word);
      glyphs.forEach((glyph) => font.outlineSvg(glyph.id));
      expect(glyphNames(glyphs)).not.toContain("dottedCircle");
    }
  });

  it("forms conjuncts through the font's GSUB rules", () => {
    const font = createBengaliFont(readFileSync(path.join(process.cwd(), "src/assets/fonts/NotoSansBengali-Regular.ttf")));
    // ক্ষ is a single conjunct glyph and the i-matra in শি is reordered before its consonant.
    expect(glyphNames(font.layout("শিক্ষা").glyphs)).toEqual([
      expect.stringMatching(/^iMatra-beng/),
      "sha-beng",
      "k_ssa-beng",
      "aaMatra-beng",
    ]);
  });
});

describe("splitScriptRuns", () => {
  it("keeps a multi-word Bengali phrase in one run and splits at script changes", () => {
    expect(splitScriptRuns("Md. রহিম উদ্দিন (CSE)")).toEqual([
      { text: "Md. ", bengali: false },
      { text: "রহিম উদ্দিন ", bengali: true },
      { text: "(CSE)", bengali: false },
    ]);
  });
});

describe("certificate text layout", () => {
  it("wraps on word boundaries within the width", () => {
    expect(wrapText("one two three four", 9, charWidth)).toEqual(["one two", "three", "four"]);
  });

  it("keeps a short title on one line at full size", () => {
    expect(layoutTitle("Intro to Web", 40, () => charWidth)).toEqual({ size: 20, lines: ["Intro to Web"] });
  });

  it("caps a very long title at three lines ending in an ellipsis", () => {
    const { size, lines } = layoutTitle(Array(30).fill("word").join(" "), 20, () => charWidth);
    expect(size).toBe(14);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
    expect(lines.every((line) => charWidth(line) <= 20)).toBe(true);
  });

  it("truncates an unbreakable line to fit", () => {
    expect(truncateToWidth("abcdefghij", 5, charWidth)).toBe("abcd…");
  });
});
