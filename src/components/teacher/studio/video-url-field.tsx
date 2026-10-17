"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, PlayCircle } from "lucide-react";
import { checkYouTubeVideoAction } from "@/app/teacher/(dashboard)/courses/[courseId]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YouTubePlayer } from "@/components/video/youtube-player";
import { parseYouTubeUrl, youTubeThumbnail } from "@/lib/youtube";
import type { YouTubeCheck } from "@/server/services/youtube-service";
import { cn } from "@/lib/utils";

type Check = { videoId: string; result: YouTubeCheck | null };

/**
 * The lesson's video link. For YouTube it shows the thumbnail and title, warns when students
 * won't be able to play it (private, embedding off, removed), and finds the length - from the
 * Data API when the server has a key, or from the player when the instructor previews it.
 */
export function VideoUrlField({
  id,
  defaultValue,
  onDuration,
  name = "videoUrl",
  label = "Video URL",
  youtubeOnly = false,
}: {
  id: string;
  defaultValue: string;
  /** Called with the video's length in seconds once it is known. */
  onDuration?: (seconds: number, source: "api" | "player") => void;
  name?: string;
  label?: string;
  /** The promo video plays from YouTube only. */
  youtubeOnly?: boolean;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [check, setCheck] = useState<Check | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const youtube = parseYouTubeUrl(url);
  const videoId = youtube?.videoId ?? null;

  // Check a YouTube link a moment after the instructor stops typing.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setCheck({ videoId, result: null });
      const result = await checkYouTubeVideoAction(url);
      if (cancelled) return;
      setCheck({ videoId, result });
      if (result.ok && result.durationSec) onDuration?.(result.durationSec, "api");
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // Only a different video needs a new check (not a t= change); onDuration is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const result = check?.videoId === videoId ? check.result : null;
  const checking = !!videoId && !result;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setPreviewing(false);
        }}
        placeholder="https://youtu.be/..."
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="flex gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Upload to YouTube as <strong>Unlisted</strong> with <strong>Allow embedding</strong> on. Unlisted videos stay out of
          search, but anyone with the link can watch.{youtubeOnly ? "" : " Vimeo and direct video file links work too."}
        </span>
      </p>

      {videoId && (
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youTubeThumbnail(videoId)} alt="" className="aspect-video w-28 shrink-0 rounded object-cover" />
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            {checking || !result ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Checking the video with YouTube…
              </p>
            ) : result.ok ? (
              <>
                <p className="line-clamp-2 font-medium text-foreground">{result.title ?? "YouTube video"}</p>
                {result.author && <p className="text-muted-foreground">{result.author}</p>}
                <p className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Students can play this video
                </p>
              </>
            ) : (
              <p
                role="alert"
                className={cn(
                  "flex gap-1.5",
                  result.reason === "unknown" ? "text-muted-foreground" : "text-amber-foreground dark:text-amber"
                )}
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                {result.message}
              </p>
            )}
            {!previewing && (
              <Button type="button" variant="outline" size="xs" onClick={() => setPreviewing(true)}>
                <PlayCircle aria-hidden />
                Preview and read the length
              </Button>
            )}
          </div>
        </div>
      )}
      {videoId && previewing && (
        <YouTubePlayer
          videoId={videoId}
          title="Video preview"
          startSec={youtube?.startSec ?? 0}
          className="rounded-lg"
          onReady={(player) => {
            const seconds = Math.round(player.getDuration());
            if (seconds > 0) onDuration?.(seconds, "player");
          }}
        />
      )}
    </div>
  );
}
