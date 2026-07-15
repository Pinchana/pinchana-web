import { FilenameStyle, formatFilename } from "./filename";

export type MediaDimensions = {
  width: number;
  height: number;
};

export type MediaAsset = {
  index: number;
  type: "image" | "video" | "audio";
  role: "content" | "soundtrack" | "cover";
  url: string;
  preview_url?: string | null;
  dimensions?: MediaDimensions | null;
  duration_seconds?: number | null;
  title?: string | null;
  artist?: string | null;
};

export type ScrapeResult = {
  id: string;
  source: {
    platform: string;
    url: string;
    application?: string | null;
  };
  content: {
    title?: string | null;
    text?: string | null;
    html?: string | null;
    published_at?: string | null;
  };
  author: {
    name?: string | null;
    username?: string | null;
  };
  media: MediaAsset[];
  music?: { album?: string | null } | null;
  engagement?: Record<string, number | null> | null;
  safety?: { spoiler: boolean; text_spoiler: boolean; nsfw: boolean } | null;
  link?: { url: string } | null;
};

export type ScrapeV1Response = {
  data: ScrapeResult;
  meta: { api_version: "1" };
};

export type DownloadAsset = {
  url: string;
  name: string;
  kind: MediaAsset["type"];
  role: Exclude<MediaAsset["role"], "cover">;
  poster?: string;
  dimensions?: MediaDimensions;
  duration?: number;
  title?: string;
  artist?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMediaAsset(value: unknown): value is MediaAsset {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.index)
    && ["image", "video", "audio"].includes(String(value.type))
    && ["content", "soundtrack", "cover"].includes(String(value.role))
    && typeof value.url === "string"
    && value.url.length > 0;
}

export function parseScrapeResponse(value: unknown): ScrapeResult {
  if (!isRecord(value) || !isRecord(value.meta) || value.meta.api_version !== "1" || !isRecord(value.data)) {
    throw new Error("This API instance returned an unsupported scrape response.");
  }
  const data = value.data;
  if (
    typeof data.id !== "string"
    || !isRecord(data.source)
    || typeof data.source.platform !== "string"
    || typeof data.source.url !== "string"
    || !isRecord(data.content)
    || !isRecord(data.author)
    || !Array.isArray(data.media)
    || !data.media.every(isMediaAsset)
  ) {
    throw new Error("This API instance returned an invalid scrape response.");
  }
  return data as ScrapeResult;
}

export function resultTitle(result: ScrapeResult): string {
  return result.content.title || result.content.text || result.id || "Untitled media";
}

export function resultAuthor(result: ScrapeResult): string {
  return result.author.name || result.author.username || "";
}

function assetExtension(url: string, kind: MediaAsset["type"]): string {
  try {
    const match = new URL(url, "https://pinchana.invalid").pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
  } catch {}
  return kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "jpg";
}

export function assetsFor(result: ScrapeResult, style: FilenameStyle): DownloadAsset[] {
  const ordered = result.media
    .filter((asset): asset is MediaAsset & { role: "content" | "soundtrack" } => asset.role !== "cover")
    .slice()
    .sort((left, right) => left.index - right.index);
  const shared = {
    title: resultTitle(result),
    author: resultAuthor(result),
    service: result.source.platform,
    id: result.id,
  };
  const includeIndex = ordered.length > 1;

  return ordered.map((asset, position) => ({
    url: asset.url,
    name: formatFilename({
      ...shared,
      title: asset.title || shared.title,
      author: asset.artist || shared.author,
      kind: asset.type,
      index: includeIndex ? position + 1 : undefined,
    }, assetExtension(asset.url, asset.type), style),
    kind: asset.type,
    role: asset.role,
    poster: asset.type === "video" ? asset.preview_url || undefined : undefined,
    dimensions: asset.dimensions || undefined,
    duration: asset.duration_seconds ?? undefined,
    title: asset.title || undefined,
    artist: asset.artist || undefined,
  }));
}

export function archiveFilenameFor(result: ScrapeResult, style: FilenameStyle): string {
  return formatFilename({
    title: resultTitle(result),
    author: resultAuthor(result),
    service: result.source.platform,
    id: result.id,
    kind: "archive",
  }, "zip", style);
}

export function coverUrlFor(result: ScrapeResult): string | undefined {
  const cover = result.media.find((asset) => asset.role === "cover");
  if (cover) return cover.url;
  const preview = result.media.find((asset) => asset.type === "video" && asset.preview_url);
  if (preview?.preview_url) return preview.preview_url;
  return result.media.find((asset) => asset.type === "image" && asset.role === "content")?.url;
}

export function previewAssetsFor(assets: DownloadAsset[]): DownloadAsset[] {
  const visual = assets.filter((asset) => asset.kind !== "audio");
  if (visual.length) return visual;
  const contentAudio = assets.filter((asset) => asset.kind === "audio" && asset.role === "content");
  return contentAudio.length ? contentAudio : assets;
}

export function soundtrackFor(assets: DownloadAsset[]): DownloadAsset | undefined {
  return assets.find((asset) => asset.kind === "audio" && asset.role === "soundtrack");
}
