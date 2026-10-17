"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAYER_STATE, YouTubePlayer, type YTPlayer } from "@/components/video/youtube-player";
import { REPORT_INTERVAL_SEC } from "@/lib/watch-progress";

const UP_NEXT_SECONDS = 8;

/**
 * A lesson's YouTube video, with progress: the position goes to the server every 15 seconds while
 * playing and on pause and end (the server caps credit by real time and completes the lesson at
 * 90% watched), the video resumes where the student stopped, and at the end the next lesson is
 * offered with a short countdown.
 */
export function LessonYouTubePlayer({
  lessonId,
  videoId,
  title,
  startSec,
  next,
}: {
  lessonId: string;
  videoId: string;
  title: string;
  /** Where to resume (see resumePosition). */
  startSec: number;
  next: { href: string; title: string } | null;
}) {
  const router = useRouter();
  const player = useRef<YTPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastSent = useRef(-1);
  const [upNext, setUpNext] = useState<number | null>(null);

  /** keepalive: a report sent as the tab closes or the student navigates away still arrives. */
  const report = useCallback(
    async (ended = false) => {
      const p = player.current;
      if (!p) return;
      const positionSec = Math.floor(p.getCurrentTime() || 0);
      if (!ended && positionSec === lastSent.current) return;
      lastSent.current = positionSec;
      try {
        const res = await fetch(`/api/v1/lessons/${lessonId}/progress`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ positionSec, ended }),
          keepalive: true,
        });
        const data = await res.json().catch(() => ({}));
        if (data.justCompleted) {
          toast.success("Lesson complete", { description: "Nice work - it's ticked off in the curriculum." });
          router.refresh();
        }
      } catch {
        // Progress is best effort; the next report catches up.
      }
    },
    [lessonId, router]
  );

  const stopTimer = () => clearInterval(timer.current);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && player.current?.getPlayerState() === PLAYER_STATE.PLAYING) void report();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopTimer();
      void report();
    };
  }, [report]);

  // The up-next countdown.
  useEffect(() => {
    if (upNext === null || !next) return;
    if (upNext <= 0) {
      router.push(next.href);
      return;
    }
    const tick = setTimeout(() => setUpNext((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(tick);
  }, [upNext, next, router]);

  function onStateChange(state: number, p: YTPlayer) {
    player.current = p;
    stopTimer();
    if (state === PLAYER_STATE.PLAYING) {
      setUpNext(null);
      timer.current = setInterval(() => void report(), REPORT_INTERVAL_SEC * 1000);
    } else if (state === PLAYER_STATE.PAUSED) {
      void report();
    } else if (state === PLAYER_STATE.ENDED) {
      void report(true);
      if (next) setUpNext(UP_NEXT_SECONDS);
    }
  }

  return (
    <div className="relative">
      <YouTubePlayer
        videoId={videoId}
        title={title}
        startSec={startSec}
        onReady={(p) => {
          player.current = p;
        }}
        onStateChange={onStateChange}
        className="rounded-none"
      />
      {upNext !== null && next && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label="Up next">
          <div className="max-w-sm space-y-4 text-center text-white">
            <p className="font-mono text-[11px] tracking-widest text-white/70 uppercase">Up next in {upNext}s</p>
            <p className="font-heading text-lg font-semibold text-balance">{next.title}</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => router.push(next.href)} className="bg-white text-black hover:bg-white/90">
                <SkipForward aria-hidden />
                Play now
              </Button>
              <Button variant="outline" onClick={() => setUpNext(null)} className="border-white/40 bg-transparent text-white hover:bg-white/10">
                <X aria-hidden />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
