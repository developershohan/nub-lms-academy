import "server-only";
// @pdf-lib/fontkit's Indic shaper (used for Bengali) calls a global `regeneratorRuntime` that its
// prebuilt bundle never ships - without this, drawing any Bengali text throws a ReferenceError.
import "regenerator-runtime/runtime";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateData = {
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  teacherName: string;
  completedAt: Date;
};

/**
 * pdf-lib's standard fonts (Helvetica etc.) only encode WinAnsi, so a Bengali student name or
 * course title made the download route throw. Noto Sans has no Bengali glyphs and Noto Sans
 * Bengali has no Latin ones, so text is split into per-script runs:
 * - Latin runs are real (selectable) text in an embedded, subsetted Noto Sans.
 * - Bengali runs are drawn as glyph outlines from fontkit's layout. Noto Sans Bengali builds many
 *   conjuncts (e.g. "ন্ট") from zero-width parts placed by GPOS mark positioning, and pdf-lib's
 *   text drawing ignores GPOS offsets entirely, so as embedded text those conjuncts break apart.
 * The font files are traced into the server bundle via outputFileTracingIncludes in next.config.ts.
 */
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

// fontkit's Path has scale() at runtime; its bundled typings just don't declare it.
type ScalablePath = { scale(x: number, y: number): { toSVG(): string } };

/**
 * Reading a glyph's outline makes fontkit cache the glyphs of its composite components with no
 * code points, and fontkit's Indic shaper reads code points back from that same per-font cache -
 * so once "রহিম" had been drawn, shaping "বু" found a u-matra with no code point and inserted a
 * dotted circle. Shaping and outline lookups therefore use separate instances of the same font.
 */
export function createBengaliFont(bytes: Uint8Array) {
  const shaper = fontkit.create(bytes);
  const outlines = fontkit.create(bytes);
  return {
    unitsPerEm: shaper.unitsPerEm,
    layout: (text: string) => shaper.layout(text),
    // drawSvgPath flips the y axis (SVG is y-down), so pre-flip the y-up font outline.
    outlineSvg: (glyphId: number) =>
      (outlines.getGlyph(glyphId).path as unknown as ScalablePath).scale(1, -1).toSVG(),
  };
}
type BengaliFont = ReturnType<typeof createBengaliFont>;

type FontFiles = { latin: Uint8Array; latinBold: Uint8Array; bengali: BengaliFont; bengaliBold: BengaliFont };

let fontFiles: Promise<FontFiles> | null = null;
function loadFonts() {
  fontFiles ??= Promise.all(
    ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSansBengali-Regular.ttf", "NotoSansBengali-Bold.ttf"].map(
      (file) => readFile(path.join(FONT_DIR, file))
    )
  )
    .then(([latin, latinBold, bengali, bengaliBold]) => ({
      latin,
      latinBold,
      bengali: createBengaliFont(bengali),
      bengaliBold: createBengaliFont(bengaliBold),
    }))
    .catch((err) => {
      fontFiles = null; // don't cache a failed read for the life of the process
      throw err;
    });
  return fontFiles;
}

type FontFamily = { latin: PDFFont; bengali: BengaliFont };
type Measure = (text: string) => number;

// Bengali block plus the danda marks Bengali shares with Devanagari and the zero-width
// (non-)joiners that control conjunct formation.
const BENGALI_CHAR = /[\u0980-\u09ff\u0964\u0965\u200c\u200d]/;

/** Splits text into runs of the same script. Whitespace stays in the run it follows, so a
 * multi-word Bengali phrase is shaped as one run rather than word by word. */
export function splitScriptRuns(text: string): { text: string; bengali: boolean }[] {
  const runs: { text: string; bengali: boolean }[] = [];
  for (const char of text) {
    const last = runs[runs.length - 1];
    const bengali = last && /\s/.test(char) ? last.bengali : BENGALI_CHAR.test(char);
    if (last && last.bengali === bengali) last.text += char;
    else runs.push({ text: char, bengali });
  }
  return runs;
}

function bengaliRunWidth(font: BengaliFont, text: string, size: number) {
  const { positions } = font.layout(text);
  return (positions.reduce((sum, p) => sum + p.xAdvance, 0) * size) / font.unitsPerEm;
}

function measureText(text: string, fonts: FontFamily, size: number) {
  return splitScriptRuns(text).reduce(
    (width, run) =>
      width +
      (run.bengali ? bengaliRunWidth(fonts.bengali, run.text, size) : fonts.latin.widthOfTextAtSize(run.text, size)),
    0
  );
}

/** Greedy word wrap. A single word wider than maxWidth gets a line of its own (the caller
 * truncates it) rather than being split mid-word. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function truncateToWidth(text: string, maxWidth: number, measure: Measure): string {
  if (measure(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && measure(`${chars.join("").trimEnd()}…`) > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

/** Long course titles wrap onto up to two lines, shrinking from 20pt to 16pt; anything longer
 * gets three 14pt lines with an ellipsis, so it never runs off the page. */
export function layoutTitle(text: string, maxWidth: number, measureAt: (size: number) => Measure) {
  for (const size of [20, 18, 16]) {
    const measure = measureAt(size);
    const lines = wrapText(text, maxWidth, measure);
    if (lines.length <= 2 && lines.every((line) => measure(line) <= maxWidth)) return { size, lines };
  }
  const size = 14;
  const measure = measureAt(size);
  const wrapped = wrapText(text, maxWidth, measure);
  const lines = wrapped.slice(0, 3);
  if (wrapped.length > 3) lines[2] = `${lines[2]}…`;
  return { size, lines: lines.map((line) => truncateToWidth(line, maxWidth, measure)) };
}

function drawRuns(page: PDFPage, text: string, x: number, y: number, fonts: FontFamily, size: number, color: RGB) {
  for (const run of splitScriptRuns(text)) {
    if (!run.bengali) {
      page.drawText(run.text, { x, y, size, font: fonts.latin, color });
      x += fonts.latin.widthOfTextAtSize(run.text, size);
      continue;
    }
    const scale = size / fonts.bengali.unitsPerEm;
    const { glyphs, positions } = fonts.bengali.layout(run.text);
    glyphs.forEach((glyph, i) => {
      const { xAdvance, xOffset, yOffset } = positions[i];
      const outline = fonts.bengali.outlineSvg(glyph.id);
      if (outline) page.drawSvgPath(outline, { x: x + xOffset * scale, y: y + yOffset * scale, scale, color });
      x += xAdvance * scale;
    });
  }
}

function centerText(page: PDFPage, text: string, y: number, fonts: FontFamily, size: number, color: RGB) {
  const x = (page.getSize().width - measureText(text, fonts, size)) / 2;
  drawRuns(page, text, x, y, fonts, size, color);
}

/** Single-line text (names) shrinks down to minSize to fit, then truncates as a last resort. */
function fitLine(text: string, fonts: FontFamily, maxWidth: number, size: number, minSize: number) {
  while (size > minSize && measureText(text, fonts, size) > maxWidth) size -= 1;
  return { size, text: truncateToWidth(text, maxWidth, (s) => measureText(s, fonts, size)) };
}

const singleLine = (text: string) => text.replace(/\s+/g, " ").trim();

export async function renderCertificatePdf(certificate: CertificateData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([792, 612]); // US Letter, landscape
  const { width, height } = page.getSize();

  const fonts = await loadFonts();
  const regular: FontFamily = { latin: await pdfDoc.embedFont(fonts.latin, { subset: true }), bengali: fonts.bengali };
  const bold: FontFamily = { latin: await pdfDoc.embedFont(fonts.latinBold, { subset: true }), bengali: fonts.bengaliBold };

  const appName = process.env.APP_NAME || "LMS Platform";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const verifyUrl = `${baseUrl}/certificates/verify/${certificate.certificateNumber}`;
  const ink = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.4, 0.4, 0.45);
  const contentWidth = width - 140;

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: rgb(0.15, 0.15, 0.2),
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: rgb(0.75, 0.75, 0.8),
    borderWidth: 1,
  });

  centerText(page, appName.toUpperCase(), height - 90, bold, 16, muted);
  centerText(page, "Certificate of Completion", height - 145, bold, 30, ink);
  centerText(page, "This certifies that", height - 195, regular, 14, muted);
  const name = fitLine(singleLine(certificate.studentName), bold, contentWidth, 26, 16);
  centerText(page, name.text, height - 235, bold, name.size, ink);
  centerText(page, "has successfully completed the course", height - 270, regular, 14, muted);

  const title = layoutTitle(singleLine(certificate.courseTitle), contentWidth, (size) => (s) =>
    measureText(s, bold, size)
  );
  const lineHeight = title.size * 1.25;
  title.lines.forEach((line, index) => centerText(page, line, height - 305 - index * lineHeight, bold, title.size, ink));
  const titleBottom = height - 305 - (title.lines.length - 1) * lineHeight;

  const completedDate = certificate.completedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  centerText(page, `Completed on ${completedDate}`, titleBottom - 35, regular, 12, muted);

  // Signature lines
  const signerName = process.env.CERTIFICATE_SIGNER_NAME || "Platform Admin";
  const signerTitle = process.env.CERTIFICATE_SIGNER_TITLE || "Course Director";
  const signatureWidth = 180;

  page.drawLine({ start: { x: 140, y: 120 }, end: { x: 340, y: 120 }, thickness: 1, color: rgb(0.6, 0.6, 0.65) });
  const teacher = fitLine(singleLine(certificate.teacherName), bold, signatureWidth, 12, 8);
  drawRuns(page, teacher.text, 150, 128, bold, teacher.size, ink);
  drawRuns(page, "Instructor", 150, 106, regular, 9, muted);

  page.drawLine({
    start: { x: width - 340, y: 120 },
    end: { x: width - 140, y: 120 },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.65),
  });
  const signer = fitLine(singleLine(signerName), bold, signatureWidth, 12, 8);
  drawRuns(page, signer.text, width - 330, 128, bold, signer.size, ink);
  drawRuns(page, signerTitle, width - 330, 106, regular, 9, muted);

  // Footer: certificate number + verification URL
  drawRuns(page, `Certificate No. ${certificate.certificateNumber}`, 44, 44, regular, 9, muted);
  const urlWidth = measureText(verifyUrl, regular, 9);
  drawRuns(page, verifyUrl, width - 44 - urlWidth, 44, regular, 9, muted);

  // QR code linking to the public verification page - a nice-to-have, never block the PDF on it.
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 });
    const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    page.drawImage(qrImage, { x: width / 2 - 35, y: 55, width: 70, height: 70 });
  } catch {
    // Skip silently - the certificate is still valid and verifiable via the printed URL.
  }

  return pdfDoc.save();
}
