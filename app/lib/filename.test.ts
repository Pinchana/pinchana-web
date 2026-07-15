import { describe, expect, test } from "bun:test";
import { BRAND_MARK, formatFilename, serviceFromUrl, youtubeIdFromUrl } from "./filename";

const video = {
  title: "Video Title",
  author: "Video Author",
  service: "youtube",
  id: "dQw4w9WgXcQ",
  quality: "1080p",
  codec: "H.264",
  kind: "video" as const,
};

describe("formatFilename", () => {
  test("renders all four branded styles", () => {
    expect(formatFilename(video, "mp4", "classic")).toBe("youtube_dQw4w9WgXcQ_1080p_h264_[pinchana.cc].mp4");
    expect(formatFilename(video, "mp4", "basic")).toBe("Video Title - Video Author [pinchana.cc].mp4");
    expect(formatFilename(video, "mp4", "pretty")).toBe("Video Title - Video Author (1080p, H.264, youtube) [pinchana.cc].mp4");
    expect(formatFilename(video, "mp4", "nerdy")).toBe("Video Title - Video Author (1080p, H.264, youtube, dQw4w9WgXcQ) [pinchana.cc].mp4");
  });

  test("keeps multi-item order and archive branding", () => {
    expect(formatFilename({ ...video, service: "instagram", id: "post", quality: null, codec: null, kind: "image", index: 2 }, "jpg", "pretty"))
      .toBe("Video Title - Video Author - 02 (instagram) [pinchana.cc].jpg");
    expect(formatFilename({ ...video, service: "instagram", id: "post", quality: null, codec: null, kind: "archive" }, "zip", "classic"))
      .toBe("instagram_post_[pinchana.cc].zip");
  });

  test("sanitizes paths, preserves Unicode, and keeps the brand after truncation", () => {
    const filename = formatFilename({ ...video, title: "猫 / ".repeat(200), author: "CON", service: "youtube" }, "mp4", "pretty");
    expect(filename.endsWith(`${BRAND_MARK}.mp4`)).toBe(true);
    expect(new TextEncoder().encode(filename).byteLength).toBeLessThanOrEqual(240);
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    expect(filename).toContain("猫");
  });

  test("uses stable fallbacks for missing metadata", () => {
    expect(formatFilename({ service: "threads", id: "abc", kind: "video" }, "mp4", "basic"))
      .toBe("abc [pinchana.cc].mp4");
  });
});

test("derives service and YouTube ids from source URLs", () => {
  expect(serviceFromUrl("https://www.instagram.com/p/abc/")).toBe("instagram");
  expect(serviceFromUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
  expect(youtubeIdFromUrl("https://youtu.be/dQw4w9WgXcQ?t=1")).toBe("dQw4w9WgXcQ");
});
