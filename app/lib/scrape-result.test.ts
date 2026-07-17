import { describe, expect, test } from "bun:test";
import {
  ScrapeV1Response,
  archiveFilenameFor,
  assetsFor,
  coverUrlFor,
  parseScrapeResponse,
  previewAssetsFor,
  resultAuthor,
  resultTitle,
  soundtrackFor,
} from "./scrape-result";

function response(media: ScrapeV1Response["data"]["media"]): ScrapeV1Response {
  return {
    data: {
      id: "post-1",
      source: {
        platform: "threads",
        url: "https://www.threads.com/@creator/post/post-1",
        application: null,
      },
      content: {
        title: null,
        text: "Post text",
        html: "<p>Post text</p>",
        published_at: "2026-07-15T00:00:00Z",
      },
      author: { name: "Creator Name", username: "creator" },
      media,
      music: null,
      engagement: null,
      safety: null,
      link: null,
    },
    meta: { api_version: "1" },
  };
}

describe("normalized scrape responses", () => {
  test("accepts v1 and rejects the legacy flat response", () => {
    const parsed = parseScrapeResponse(response([]));
    expect(parsed.id).toBe("post-1");
    expect(resultTitle(parsed)).toBe("Post text");
    expect(resultAuthor(parsed)).toBe("Creator Name");
    expect(() => parseScrapeResponse({ shortcode: "legacy" })).toThrow("unsupported scrape response");
  });

  test("maps Threads content and soundtrack while excluding cover from downloads", () => {
    const parsed = parseScrapeResponse(response([
      {
        index: 0,
        type: "image",
        role: "content",
        url: "/api/media/threads/post-1/image.jpg",
        dimensions: { width: 896, height: 1195 },
      },
      {
        index: 1,
        type: "audio",
        role: "soundtrack",
        url: "/api/media/threads/post-1/music.m4a",
        duration_seconds: 30,
        title: "Kalinka",
        artist: "Russian Balalaika Orchestra",
      },
      {
        index: 2,
        type: "image",
        role: "cover",
        url: "/api/media/threads/post-1/cover.jpg",
        dimensions: { width: 1080, height: 1080 },
      },
    ]));

    const assets = assetsFor(parsed, "pretty");
    expect(assets).toHaveLength(2);
    expect(assets.map((asset) => asset.role)).toEqual(["content", "soundtrack"]);
    expect(assets[0].dimensions).toEqual({ width: 896, height: 1195 });
    expect(assets[1].duration).toBe(30);
    expect(assets[1].name).toContain("Kalinka - Russian Balalaika Orchestra");
    expect(previewAssetsFor(assets)).toEqual([assets[0]]);
    expect(soundtrackFor(assets)).toEqual(assets[1]);
    expect(coverUrlFor(parsed)).toBe("/api/media/threads/post-1/cover.jpg");
  });

  test("orders mixed carousel media by index and keeps the video preview", () => {
    const parsed = parseScrapeResponse(response([
      {
        index: 1,
        type: "video",
        role: "content",
        url: "/api/media/twitter/post-1/video.mp4",
        preview_url: "/api/media/twitter/post-1/poster.jpg",
        dimensions: { width: 1920, height: 1080 },
        looping: true,
      },
      {
        index: 0,
        type: "image",
        role: "content",
        url: "/api/media/twitter/post-1/image.jpg",
        dimensions: { width: 1200, height: 800 },
      },
    ]));

    const assets = assetsFor(parsed, "classic");
    expect(assets.map((asset) => asset.kind)).toEqual(["image", "video"]);
    expect(assets[1].poster).toBe("/api/media/twitter/post-1/poster.jpg");
    expect(assets[1].looping).toBe(true);
    expect(archiveFilenameFor(parsed, "classic")).toBe("threads_post-1_[pinchana.cc].zip");
  });

  test("uses content audio for audio-only previews and supports empty media", () => {
    const parsed = parseScrapeResponse(response([
      {
        index: 0,
        type: "audio",
        role: "content",
        url: "/api/media/deezer/post-1/one.mp3",
        title: "One",
        artist: "Artist",
      },
      {
        index: 1,
        type: "audio",
        role: "content",
        url: "/api/media/deezer/post-1/two.mp3",
        title: "Two",
        artist: "Artist",
      },
    ]));
    const assets = assetsFor(parsed, "basic");
    expect(previewAssetsFor(assets)).toEqual(assets);
    expect(soundtrackFor(assets)).toBeUndefined();
    expect(assetsFor(parseScrapeResponse(response([])), "basic")).toEqual([]);
  });
});
