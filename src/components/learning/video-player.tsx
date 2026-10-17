import { getVideoEmbed } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { YouTubePlayer } from "@/components/video/youtube-player";

/** Any lesson or preview video without progress tracking: YouTube through the IFrame API player,
 * Vimeo in its embed, anything else as a plain video file. */
export function VideoPlayer({ url, title, className }: { url: string; title?: string; className?: string }) {
  const embed = getVideoEmbed(url);

  if (embed.kind === "youtube") {
    return (
      <YouTubePlayer
        videoId={embed.videoId}
        title={title ?? "Video"}
        startSec={embed.startSec ?? 0}
        className={cn("rounded-md", className)}
      />
    );
  }

  if (embed.kind === "vimeo") {
    return (
      <div className={cn("aspect-video w-full overflow-hidden rounded-md bg-black", className)}>
        <iframe
          src={embed.embedUrl}
          title={title ?? "Lesson video"}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return <video controls className={cn("w-full rounded-md bg-black", className)} src={url} title={title} />;
}
