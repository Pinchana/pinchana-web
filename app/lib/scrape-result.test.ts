import { describe, expect, test } from "bun:test";
import {
  assetsFor,
  parseScrapeResponse,
  resultAuthor,
  resultTitle,
} from "./scrape-result";

describe("v2 normalized scrape responses", () => {
  test("accepts v2 web ready response", () => {
    const v2Ready = {
      status: "ready",
      request_id: "req-123",
      source: { platform: "instagram", url: "https://www.instagram.com/p/POST123/" },
      content: { shortcode: "POST123", caption: "Test post caption" },
      author: { username: "test_user" },
      assets: [
        {
          id: "POST123-0",
          asset_key: "instagram:POST123:0:content",
          index: 0,
          type: "video",
          role: "content",
          filename: "video.mp4",
          mime_type: "video/mp4",
          size: 10485760,
          dimensions: { width: 1080, height: 1920 },
          duration_seconds: 12.5,
          bitrate: 2_000_000,
          looping: true,
          delivery: {
            kind: "tunnel",
            url: "/v2/assets/ticket-abc-123",
            expires_at: Math.floor(Date.now() / 1000) + 600,
          },
        },
      ],
    };

    const parsed = parseScrapeResponse(v2Ready);
    expect(parsed.id).toBe("POST123");
    expect(resultTitle(parsed)).toBe("Test post caption");
    expect(resultAuthor(parsed)).toBe("test_user");

    const assets = assetsFor(parsed, "classic");
    expect(assets).toHaveLength(1);
    expect(assets[0].url).toBe("/api/v2/assets/ticket-abc-123");
    expect(assets[0].kind).toBe("video");
    expect(assets[0].size).toBe(10485760);
    expect(assets[0].duration).toBe(12.5);
    expect(assets[0].bitrate).toBe(2_000_000);
    expect(assets[0].looping).toBe(true);
  });

  test("rejects invalid scrape response payloads", () => {
    expect(() => parseScrapeResponse({ status: "unknown" })).toThrow("unsupported scrape response");
    expect(() => parseScrapeResponse(null)).toThrow("unsupported scrape response");
  });

  test("keeps preview availability and excludes artwork from downloads", () => {
    const parsed = parseScrapeResponse({
      status: "ready",
      request_id: "req-audio",
      source: { platform: "spotify", url: "https://open.spotify.com/track/track123" },
      content: {
        shortcode: "sp-track-track123",
        title: "Track",
        availability: "preview",
        classifications: ["preview_audio"],
      },
      assets: [
        {
          id: "preview",
          asset_key: "spotify:track123:preview",
          index: 0,
          type: "audio",
          role: "preview",
          availability: "preview",
          filename: "Track.mp3",
          delivery: { kind: "tunnel", url: "/v2/assets/preview-ticket" },
        },
        {
          id: "art",
          asset_key: "spotify:track123:artwork",
          index: 1,
          type: "image",
          role: "artwork",
          availability: "full",
          filename: "Track.jpg",
          delivery: { kind: "tunnel", url: "/v2/assets/art-ticket" },
        },
      ],
    });
    const downloads = assetsFor(parsed, "classic");
    expect(downloads).toHaveLength(1);
    expect(downloads[0].availability).toBe("preview");
    expect(downloads[0].role).toBe("preview");
  });

  test("accepts metadata-only collections without fake asset tickets", () => {
    const parsed = parseScrapeResponse({
      status: "ready",
      request_id: "req-collection",
      source: { platform: "deezer", url: "https://deezer.com/album/42" },
      content: {
        shortcode: "dz-album-42",
        title: "Album",
        availability: "metadata-only",
        classifications: ["collection"],
        item_count: 2,
      },
      assets: [],
      collection: [
        { index: 0, item_id: "1", title: "One", availability: "preview", delivery_status: "select-item" },
        { index: 1, item_id: "2", title: "Two", availability: "metadata-only", delivery_status: "unavailable" },
      ],
    });
    expect(assetsFor(parsed, "classic")).toEqual([]);
    expect(parsed.collection?.map((item) => item.item_id)).toEqual(["1", "2"]);
    expect(parsed.content.availability).toBe("metadata-only");
  });
});
