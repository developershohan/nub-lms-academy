import { getVideoEmbed } from "@/lib/video-embed";

export function VideoPlayer({ url }: { url: string }) {
  const embed = getVideoEmbed(url);

  if (embed.kind !== "direct") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          src={embed.embedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return <video controls className="w-full rounded-md bg-black" src={url} />;
}
