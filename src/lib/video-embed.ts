import { parseYouTubeUrl, youTubeEmbedUrl } from "@/lib/youtube";

export type VideoEmbed =
  | { kind: "youtube"; embedUrl: string; videoId: string; startSec: number | null }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "direct" };

/** Pasted URLs are usually watch/share links (YouTube, Vimeo), not raw video files - detect those
 * and convert to their embeddable player URL instead of trying to play them in a <video> tag. */
export function getVideoEmbed(url: string): VideoEmbed {
  const youtube = parseYouTubeUrl(url);
  if (youtube) return { kind: "youtube", embedUrl: youTubeEmbedUrl(youtube.videoId), ...youtube };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "direct" };
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host === "vimeo.com") {
    const id = parsed.pathname.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }
  return { kind: "direct" };
}
