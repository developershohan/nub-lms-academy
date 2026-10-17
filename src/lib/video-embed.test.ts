import { describe, expect, it } from "vitest";
import { getVideoEmbed } from "./video-embed";

describe("getVideoEmbed", () => {
  it("converts youtube.com/watch links to the privacy-enhanced embed", () => {
    expect(getVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
      startSec: null,
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1",
    });
  });

  it("converts youtu.be short links, keeping the start time", () => {
    expect(getVideoEmbed("https://youtu.be/dQw4w9WgXcQ?t=42")).toMatchObject({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
      startSec: 42,
    });
  });

  it("converts vimeo.com links", () => {
    expect(getVideoEmbed("https://vimeo.com/123456789")).toEqual({
      kind: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });

  it("falls back to direct playback for an unrecognised host", () => {
    expect(getVideoEmbed("https://cdn.example.com/video.mp4")).toEqual({ kind: "direct" });
  });

  it("falls back to direct playback for a malformed URL instead of throwing", () => {
    expect(getVideoEmbed("not a url")).toEqual({ kind: "direct" });
  });
});
