import { FilenameStyle, formatFilename } from "./filename";

export type MediaDimensions = {
  width: number;
  height: number;
};

export type WebAssetV2 = {
  id: string;
  asset_key: string;
  index: number;
  type: "video" | "image" | "audio";
  role: "content" | "soundtrack" | "cover";
  filename: string;
  mime_type?: string | null;
  size?: number | null;
  dimensions?: MediaDimensions | null;
  duration_seconds?: number | null;
  bitrate?: number | null;
  looping?: boolean;
  delivery: {
    kind: "tunnel";
    url?: string;
    expires_at?: number;
  };
};

export type ScrapeV2WebReadyResponse = {
  status: "ready";
  request_id: string;
  source: { platform: string; url: string };
  content: { shortcode?: string; caption?: string; text?: string; title?: string };
  author?: { username?: string; name?: string };
  assets: WebAssetV2[];
};

export type ScrapeV2WebProcessingResponse = {
  status: "processing";
  job_id: string;
  retry_after?: number;
  expires_at?: number;
  progress?: number | null;
};

export type ScrapeV2JobFailedResponse = {
  status: "failed";
  error: string;
};

export type ScrapeV2JobExpiredResponse = {
  status: "expired";
};

export type MediaAsset = {
  index: number;
  type: "image" | "video" | "audio";
  role: "content" | "soundtrack" | "cover";
  url: string;
  dimensions?: MediaDimensions | null;
  duration_seconds?: number | null;
  title?: string | null;
  artist?: string | null;
  looping?: boolean;
  bitrate?: number | null;
  size?: number | null;
  filename?: string;
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
  dimensions?: MediaDimensions;
  duration?: number;
  title?: string;
  artist?: string;
  looping?: boolean;
  bitrate?: number;
  size?: number;
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

function v2AssetProxyUrl(value: unknown): string | null {
  if (!isRecord(value) || value.kind !== "tunnel" || typeof value.url !== "string") return null;
  const match = /^\/v2\/assets\/([A-Za-z0-9_-]{8,128})$/.exec(value.url);
  return match ? `/api/v2/assets/${match[1]}` : null;
}

export function parseScrapeResponse(value: unknown): ScrapeResult {
  if (!isRecord(value)) {
    throw new Error("This API instance returned an unsupported scrape response.");
  }

  // Handle v2 ready response
  if (value.status === "ready" && Array.isArray(value.assets) && isRecord(value.source)) {
    const assets = value.assets.map((rawAsset) => {
      if (
        !isRecord(rawAsset)
        || typeof rawAsset.id !== "string"
        || typeof rawAsset.asset_key !== "string"
        || typeof rawAsset.index !== "number"
        || !["image", "video", "audio"].includes(String(rawAsset.type))
        || !["content", "soundtrack", "cover"].includes(String(rawAsset.role))
      ) {
        throw new Error("This API instance returned an invalid v2 asset.");
      }
      const proxyUrl = v2AssetProxyUrl(rawAsset.delivery);
      if (!proxyUrl) throw new Error("This API instance returned an invalid asset ticket.");
      const a = rawAsset as unknown as WebAssetV2;
      return {
        index: a.index,
        type: a.type,
        role: a.role,
        url: proxyUrl,
        dimensions: a.dimensions || undefined,
        duration_seconds: a.duration_seconds || undefined,
        bitrate: a.bitrate ?? undefined,
        looping: a.looping === true,
        size: a.size || undefined,
        filename: a.filename,
      };
    });

    const shortcode = (isRecord(value.content) && typeof value.content.shortcode === "string") ? value.content.shortcode : "post-1";
    const textValue = isRecord(value.content) ? (value.content.caption || value.content.text || value.content.title) : undefined;
    const text = typeof textValue === "string" ? textValue : null;
    const authorObj = isRecord(value.author) ? value.author : {};

    return {
      id: shortcode,
      source: {
        platform: String(value.source.platform || "media"),
        url: String(value.source.url || ""),
      },
      content: { text },
      author: {
        name: typeof authorObj.name === "string" ? authorObj.name : null,
        username: typeof authorObj.username === "string" ? authorObj.username : null,
      },
      media: assets,
    };
  }

  // Handle v1 response
  if (isRecord(value.meta) && value.meta.api_version === "1" && isRecord(value.data)) {
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

  throw new Error("This API instance returned an unsupported scrape response.");
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
    name: asset.filename || formatFilename({
      ...shared,
      title: asset.title || shared.title,
      author: asset.artist || shared.author,
      kind: asset.type,
      index: includeIndex ? position + 1 : undefined,
    }, assetExtension(asset.url, asset.type), style),
    kind: asset.type,
    role: asset.role,
    dimensions: asset.dimensions || undefined,
    duration: asset.duration_seconds ?? undefined,
    title: asset.title || undefined,
    artist: asset.artist || undefined,
    looping: asset.looping === true,
    bitrate: asset.bitrate ?? undefined,
    size: asset.size || undefined,
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
