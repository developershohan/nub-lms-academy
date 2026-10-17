"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoPlayer } from "@/components/learning/video-player";

/** The course cover as a "Preview this course" button: the instructor's promo video in a modal.
 * The player only loads once opened, so the landing page stays light. */
export function CoursePromo({ title, url, children }: { title: string; url: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Preview this course: ${title}`}
      >
        {children}
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white transition-colors group-hover:bg-black/45">
          <PlayCircle className="size-14 drop-shadow-lg transition-transform group-hover:scale-105" aria-hidden />
          <span className="text-sm font-semibold drop-shadow">Preview this course</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Course preview: {title}</DialogTitle>
          </DialogHeader>
          {open && <VideoPlayer url={url} title={`${title} - preview`} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
