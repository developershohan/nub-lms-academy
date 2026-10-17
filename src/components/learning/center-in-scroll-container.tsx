"use client";

import { useEffect, useRef } from "react";

/**
 * Dropped inside the current lesson's row: on mount, scrolls the nearest [data-scroll-container]
 * (the curriculum sidebar or drawer) so that row sits mid-panel. Only that panel scrolls - unlike
 * scrollIntoView, which would also move the page.
 */
export function CenterInScrollContainer() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const row = ref.current?.parentElement;
    const container = row?.closest<HTMLElement>("[data-scroll-container]");
    if (!row || !container || container.clientHeight === 0) return;
    const rowTop = row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTop = Math.max(0, rowTop - container.clientHeight / 2 + row.clientHeight / 2);
  }, []);

  return <span ref={ref} hidden />;
}
