"use client";

import { useState } from "react";
import { ListTree, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LEARN_SIDEBAR_COOKIE } from "@/lib/learning-path";

/**
 * The learning player's frame: a sticky bar over the lesson, and the curriculum in a sidebar on
 * the right (lg and up, collapsible, remembered in a cookie) or a drawer on smaller screens. The
 * page renders every piece on the server; this component only owns the open/closed state.
 */
export function LearnShell({
  activeLessonId,
  initialSidebarOpen,
  bar,
  status,
  curriculum,
  children,
}: {
  activeLessonId: string;
  initialSidebarOpen: boolean;
  /** Left side of the top bar (back link, course title). */
  bar: React.ReactNode;
  /** Right side of the top bar (progress, certificate). */
  status: React.ReactNode;
  curriculum: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Picking a lesson in the drawer navigates; close the drawer once the new lesson is showing.
  const [shownLessonId, setShownLessonId] = useState(activeLessonId);
  if (shownLessonId !== activeLessonId) {
    setShownLessonId(activeLessonId);
    setDrawerOpen(false);
  }

  function toggleSidebar(open: boolean) {
    setSidebarOpen(open);
    document.cookie = `${LEARN_SIDEBAR_COOKIE}=${open ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    // -m-6 cancels the dashboard's page padding so the player runs edge to edge under its header.
    // inline-size containment keeps long, unwrappable titles (truncated in the bar) from widening
    // the dashboard column past a phone screen.
    <div className="-m-6 flex min-h-[calc(100svh-3.5rem)] flex-col [contain:inline-size]">
      <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">{bar}</div>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          {!sidebarOpen && (
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => toggleSidebar(true)}
              aria-controls="course-content"
              aria-expanded={false}
            >
              <PanelRightOpen aria-hidden />
              Course content
            </Button>
          )}
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger render={<Button variant="outline" size="sm" className="lg:hidden" />}>
              <ListTree aria-hidden />
              <span className="hidden sm:inline">Course content</span>
              <span className="sm:hidden">Contents</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] gap-0 bg-sidebar p-0 sm:max-w-sm">
              <SheetHeader className="border-b pr-12">
                <SheetTitle className="font-semibold">Course content</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
                {curriculum}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex flex-1">
        <div className="min-w-0 flex-1">{children}</div>
        {sidebarOpen && (
          <aside
            id="course-content"
            aria-label="Course content"
            className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[22rem] shrink-0 overflow-y-auto border-l bg-sidebar lg:block"
            data-scroll-container
          >
            <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b bg-sidebar px-4">
              <p className="font-heading font-semibold">Course content</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleSidebar(false)}
                aria-label="Hide course content"
                aria-controls="course-content"
                aria-expanded
              >
                <PanelRightClose aria-hidden />
              </Button>
            </div>
            {curriculum}
          </aside>
        )}
      </div>
    </div>
  );
}
