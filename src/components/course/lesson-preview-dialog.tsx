"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VideoPlayer } from "@/components/learning/video-player";
import type { LessonPreview } from "@/server/services/course-landing-service";

type PlaybackState = { status: "idle" | "loading" } | { status: "ready"; url: string } | { status: "error" };

/** A free-preview lesson opened in a modal from the curriculum, so a visitor can sample the
 * course without leaving the page. Video previews fetch their playback URL only when opened. */
export function LessonPreviewDialog({ title, preview }: { title: string; preview: LessonPreview }) {
  const [playback, setPlayback] = useState<PlaybackState>({ status: "idle" });

  async function loadPlayback(open: boolean) {
    if (!open || preview.kind !== "video" || playback.status !== "idle") return;
    setPlayback({ status: "loading" });
    try {
      const res = await fetch(`/api/v1/videos/${preview.videoId}/playback`);
      const data = await res.json();
      setPlayback(res.ok && data.playbackUrl ? { status: "ready", url: data.playbackUrl } : { status: "error" });
    } catch {
      setPlayback({ status: "error" });
    }
  }

  return (
    <Dialog onOpenChange={loadPlayback}>
      <DialogTrigger className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
        <PlayCircle className="size-3.5" aria-hidden />
        Preview
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {preview.kind === "text" ? (
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {preview.content}
          </div>
        ) : playback.status === "ready" ? (
          <VideoPlayer url={playback.url} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            {playback.status === "error" ? "This preview couldn't be loaded." : "Loading preview..."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
