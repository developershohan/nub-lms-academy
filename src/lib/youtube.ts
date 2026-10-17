/*
 * YouTube helpers. Lessons store whatever link the instructor pasted; everything that plays or
 * previews a lesson goes through parseYouTubeUrl, which understands every form YouTube hands out.
 */

export type YouTubeRef = {
  videoId: string;
  /** From t= / start= / #t= on the link, in seconds. */
  startSec: number | null;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);
/** Path prefixes whose next segment is the video id: /embed/ID, /shorts/ID, /live/ID... */
const ID_PATH_PREFIXES = new Set(["embed", "shorts", "live", "v", "e"]);

/** "90", "90s", "1m30s", "1h2m3s" -> seconds; null for anything else. */
export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/**
 * The video id (and start time) in any YouTube link: watch?v=, youtu.be/, /shorts/, /embed/,
 * /live/, youtube-nocookie.com, the mobile and music sites, with or without www - or null when
 * it isn't a YouTube video link.
 */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (first === "watch") videoId = url.searchParams.get("v");
    else if (first && ID_PATH_PREFIXES.has(first)) videoId = second ?? null;
  }
  if (!videoId || !VIDEO_ID.test(videoId)) return null;

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const startSec =
    parseTimestamp(url.searchParams.get("t")) ??
    parseTimestamp(url.searchParams.get("start")) ??
    parseTimestamp(fragment.get("t"));
  return { videoId, startSec };
}

export const youTubeThumbnail = (videoId: string) => `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

export const youTubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Privacy-enhanced embed: no YouTube cookies until the viewer presses play. */
export const youTubeEmbedUrl = (videoId: string) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;

/** ISO 8601 durations from the YouTube Data API ("PT1H2M3S", "P1DT2H") -> seconds; null if unreadable. */
export function parseIsoDuration(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || value === "P" || value.endsWith("T")) return null;
  const [, d, h, m, s] = match;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
