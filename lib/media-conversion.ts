export type CachedMediaPath = {
  platform: string;
  postId: string;
  filename: string;
};

export function parseCachedMediaPath(value: unknown): CachedMediaPath | null {
  if (typeof value !== "string" || !value.startsWith("/api/media/") || value.includes("?") || value.includes("#")) {
    return null;
  }
  let parts: string[];
  try {
    parts = value
      .slice("/api/media/".length)
      .split("/")
      .map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  if (
    parts.length < 3
    || parts.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\") || part.includes("\0"))
  ) {
    return null;
  }
  const [platform, postId, ...filenameParts] = parts;
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(platform) || postId.length > 256) return null;
  const filename = filenameParts.join("/");
  if (filename.length > 1024) return null;
  return { platform, postId, filename };
}
