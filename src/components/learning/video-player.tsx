import { getVideoEmbed } from "@/lib/video-embed";
import { cn } from "@/lib/utils";

export function VideoPlayer({ url, title, className }: { url: string; title?: string; className?: string }) {
  const embed = getVideoEmbed(url);

  if (embed.kind !== "direct") {
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
