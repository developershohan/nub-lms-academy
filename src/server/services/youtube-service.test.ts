import { afterEach, describe, expect, it, vi } from "vitest";
import { checkYouTubeVideo } from "./youtube-service";

const URL_ = "https://youtu.be/dQw4w9WgXcQ";
const respond = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  delete process.env.YOUTUBE_API_KEY;
});

describe("checkYouTubeVideo", () => {
  it("returns the title, author and thumbnail of a playable video", async () => {
    const fetchMock = respond(200, { title: "Intro", author_name: "NUB Academy" });
    await expect(checkYouTubeVideo(URL_, fetchMock)).resolves.toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      title: "Intro",
      author: "NUB Academy",
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      durationSec: null,
    });
    // No key: oEmbed only, never the Data API.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("warns about private or non-embeddable videos, and removed ones", async () => {
    await expect(checkYouTubeVideo(URL_, respond(401))).resolves.toMatchObject({ ok: false, reason: "unplayable" });
    await expect(checkYouTubeVideo(URL_, respond(404))).resolves.toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("never blocks saving when YouTube can't be reached", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(checkYouTubeVideo(URL_, failing)).resolves.toMatchObject({ ok: false, reason: "unknown" });
  });

  it("says when a link isn't YouTube at all, without calling out", async () => {
    const fetchMock = respond(200);
    await expect(checkYouTubeVideo("https://vimeo.com/123", fetchMock)).resolves.toMatchObject({ reason: "not-youtube" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the length from the Data API when a key is configured", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Intro" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ contentDetails: { duration: "PT12M5S" } }] }), { status: 200 }));
    await expect(checkYouTubeVideo(URL_, fetchMock)).resolves.toMatchObject({ ok: true, durationSec: 725 });
  });
});
