import { parseLessonText } from "@/lib/lesson-text";
import { cn } from "@/lib/utils";

/** A text lesson set as an article: ~68 characters a line, generous leading and paragraph
 * spacing, headings and lists from the teacher's plain text (see parseLessonText). */
export function LessonArticle({ text, className }: { text: string | null; className?: string }) {
  const blocks = parseLessonText(text);
  if (blocks.length === 0) {
    return <p className={cn("text-muted-foreground", className)}>This lesson has no text yet.</p>;
  }

  return (
    <article className={cn("max-w-[68ch] text-[1.0625rem] leading-[1.8] text-foreground/90", className)}>
      {blocks.map((block, index) => {
        const spacing = index === 0 ? "" : block.kind === "heading" ? "mt-10" : "mt-5";
        if (block.kind === "heading") {
          return block.level === 2 ? (
            <h2 key={index} className={cn("font-heading text-2xl leading-snug font-semibold text-foreground", spacing)}>
              {block.text}
            </h2>
          ) : (
            <h3 key={index} className={cn("font-heading text-xl leading-snug font-semibold text-foreground", spacing)}>
              {block.text}
            </h3>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={cn(
                "space-y-2 pl-6 marker:text-muted-foreground",
                block.ordered ? "list-decimal" : "list-disc",
                spacing
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  {item}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className={cn("whitespace-pre-line", spacing)}>
            {block.text}
          </p>
        );
      })}
    </article>
  );
}
