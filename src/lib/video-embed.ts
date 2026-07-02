export type VideoEmbed = { kind: "youtube" | "vimeo"; embedUrl: string } | { kind: "direct" };

/** Pasted URLs are usually watch/share links (YouTube, Vimeo), not raw video files - detect those
 * and convert to their embeddable player URL instead of trying to play them in a <video> tag. */
export function getVideoEmbed(url: string): VideoEmbed {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "direct" };
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = parsed.pathname === "/watch" ? parsed.searchParams.get("v") : parsed.pathname.split("/").pop();
    if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = parsed.pathname.split("/").filter(Boolean).pop();
    if (id) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  return { kind: "direct" };
}
