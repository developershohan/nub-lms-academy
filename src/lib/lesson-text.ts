/**
 * Text lessons are plain text typed into a textarea. To make them read like an article rather
 * than one wall of text, blank lines separate paragraphs, and a few line prefixes teachers type
 * anyway become structure: "# " / "## " headings, "- " / "* " / "• " bullets, "1. " / "1) "
 * numbered steps. Everything else stays literal text - no HTML is ever produced from content.
 */

export type LessonTextBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^[-*•]\s+(.+)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.+)$/;

export function parseLessonText(text: string | null | undefined): LessonTextBlock[] {
  const blocks: LessonTextBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (const rawLine of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length === 1 ? 2 : 3, text: heading[2].trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = !!numbered;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item[1].trim());
      else blocks.push({ kind: "list", ordered, items: [item[1].trim()] });
      continue;
    }

    // A line that doesn't start a new item closes any list above it and begins a paragraph.
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** Reading time at ~200 words a minute, never less than one minute for non-empty text. */
export function readingMinutes(text: string | null | undefined) {
  const words = (text ?? "").split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : Math.max(1, Math.round(words / 200));
}
