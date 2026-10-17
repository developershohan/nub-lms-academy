import "server-only";
import { parseIsoDuration, parseYouTubeUrl, youTubeThumbnail, youTubeWatchUrl } from "@/lib/youtube";

export type YouTubeCheck =
  | {
      ok: true;
      videoId: string;
      title: string | null;
      author: string | null;
      thumbnailUrl: string;
      /** Only when YOUTUBE_API_KEY is set; otherwise the studio reads it from the player. */
      durationSec: number | null;
    }
  | { ok: false; reason: "not-youtube" | "unplayable" | "unavailable" | "unknown"; message: string };

const TIMEOUT_MS = 5000;

/**
 * Checks a lesson's YouTube link the way students will hit it: oEmbed answers 401/403 for a
 * private video or one with embedding turned off, and 404 for one that doesn't exist. With
 * YOUTUBE_API_KEY set, the Data API also supplies the length; without it nothing breaks.
 */
export async function checkYouTubeVideo(url: string, fetchImpl: typeof fetch = fetch): Promise<YouTubeCheck> {
  const ref = parseYouTubeUrl(url);
  if (!ref) return { ok: false, reason: "not-youtube", message: "That isn't a YouTube video link." };

  let res: Response;
  try {
    res = await fetchImpl(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeWatchUrl(ref.videoId))}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
  } catch {
    return { ok: false, reason: "unknown", message: "Couldn't reach YouTube to check this video. You can still save it." };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      reason: "unplayable",
      message: "This video is private or doesn't allow embedding, so students can't play it here. Make it Unlisted and turn on \"Allow embedding\".",
    };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, reason: "unavailable", message: "YouTube can't find this video. Check the link - it may have been removed." };
  }
  if (!res.ok) {
    return { ok: false, reason: "unknown", message: "Couldn't check this video with YouTube right now. You can still save it." };
  }

  const info = (await res.json().catch(() => ({}))) as { title?: string; author_name?: string };
  return {
    ok: true,
    videoId: ref.videoId,
    title: info.title ?? null,
    author: info.author_name ?? null,
    thumbnailUrl: youTubeThumbnail(ref.videoId),
    durationSec: await fetchDuration(ref.videoId, fetchImpl),
  };
}

/** The YouTube Data API v3 length, or null without a key or on any failure. */
async function fetchDuration(videoId: string, fetchImpl: typeof fetch) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchImpl(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { contentDetails?: { duration?: string } }[] };
    const iso = data.items?.[0]?.contentDetails?.duration;
    return iso ? parseIsoDuration(iso) : null;
  } catch {
    return null;
  }
}
