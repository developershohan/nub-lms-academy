import { describe, expect, it } from "vitest";
import { getVideoEmbed } from "./video-embed";

describe("getVideoEmbed", () => {
  it("converts youtube.com/watch links", () => {
    expect(getVideoEmbed("https://www.youtube.com/watch?v=abc123")).toEqual({
      kind: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("converts youtu.be short links", () => {
    expect(getVideoEmbed("https://youtu.be/abc123")).toEqual({
      kind: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
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
