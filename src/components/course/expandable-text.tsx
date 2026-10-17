"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Long text shown collapsed with a fade and a "Show more" toggle. Short text renders as is. */
export function ExpandableText({ text, collapseAfter = 600 }: { text: string; collapseAfter?: number }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = text.length > collapseAfter;

  return (
    <div>
      <div className={cn("relative", collapsible && !expanded && "max-h-48 overflow-hidden")}>
        <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{text}</p>
        {collapsible && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background" aria-hidden />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </div>
  );
}
