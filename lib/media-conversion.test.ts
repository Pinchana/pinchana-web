import { describe, expect, test } from "bun:test";

import { parseCachedMediaPath } from "./media-conversion";

describe("parseCachedMediaPath", () => {
  test("maps an authenticated media route to the server cache coordinates", () => {
    expect(parseCachedMediaPath("/api/media/twitter/post-1/video%20one.mp4")).toEqual({
      platform: "twitter",
      postId: "post-1",
      filename: "video one.mp4",
    });
  });

  test("supports nested cached filenames", () => {
    expect(parseCachedMediaPath("/api/media/twitter/post-1/video/source.mp4")?.filename).toBe("video/source.mp4");
  });

  test("rejects external, traversal, encoded separator, and query paths", () => {
    for (const value of [
      "https://example.com/api/media/twitter/post/video.mp4",
      "/api/media/twitter/../video.mp4",
      "/api/media/twitter/post/%2Fetc",
      "/api/media/twitter/post/video.mp4?url=https://example.com",
    ]) {
      expect(parseCachedMediaPath(value)).toBeNull();
    }
  });
});
