"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { STUDIO_SECTIONS, studioHref, type StudioSectionKey } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * The studio's section list: a scrolling tab strip on phones and tablets, a side rail from xl up
 * (the dashboard sidebar already takes 240px). A dot marks sections with required checklist items left.
 */
export function StudioNav({ courseId, unfinished }: { courseId: string; unfinished: StudioSectionKey[] }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On the tab strip, bring the current section into view - "Pricing" starts off-screen on a phone.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav
      aria-label="Course studio"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:thin] sm:-mx-6 sm:px-6 xl:mx-0 xl:overflow-visible xl:px-0"
    >
      <ul className="flex gap-1 border-b pb-px xl:sticky xl:top-6 xl:flex-col xl:border-b-0 xl:pb-0">
        {STUDIO_SECTIONS.map((section) => {
          const href = studioHref(courseId, section.key);
          const active = pathname === href;
          const todo = unfinished.includes(section.key);
          return (
            <li key={section.key} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-muted text-foreground",
                  // Underline the active tab on the strip; the rail uses the filled background alone.
                  active &&
                    "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary xl:after:hidden"
                )}
              >
                {section.label}
                {todo && (
                  <>
                    <span className="size-1.5 rounded-full bg-amber" aria-hidden />
                    <span className="sr-only">(needs work)</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
