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
  role: "content" | "soundtrack" | "preview" | "cover" | "artwork";
  availability?: "full" | "preview" | "metadata-only";
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
  content: {
    shortcode?: string;
    caption?: string;
    text?: string;
    title?: string;
    album?: string | null;
    duration_seconds?: number | null;
    availability?: "full" | "preview" | "metadata-only";
    classifications?: string[];
    item_count?: number;
    resolved_item_count?: number;
    collection_truncated?: boolean;
  };
  author?: { username?: string; name?: string };
  assets: WebAssetV2[];
  collection?: CollectionItem[];
};

export type CollectionItem = {
  index: number;
  item_id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  duration_seconds?: number | null;
  availability: "full" | "preview" | "metadata-only";
  classifications?: string[];
  asset_count?: number;
  delivery_status: "select-item" | "processing-required" | "unavailable";
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
  role: "content" | "soundtrack" | "preview" | "cover" | "artwork";
  availability?: "full" | "preview" | "metadata-only";
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
    album?: string | null;
    duration_seconds?: number | null;
    availability?: "full" | "preview" | "metadata-only";
    classifications?: string[];
    item_count?: number;
    resolved_item_count?: number;
    collection_truncated?: boolean;
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
  collection?: CollectionItem[];
};

export type ScrapeV1Response = {
  data: ScrapeResult;
  meta: { api_version: "1" };
};

export type DownloadAsset = {
  url: string;
  name: string;
  kind: MediaAsset["type"];
  role: "content" | "soundtrack" | "preview";
  availability: "full" | "preview" | "metadata-only";
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
    && ["content", "soundtrack", "preview", "cover", "artwork"].includes(String(value.role))
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
        || !["content", "soundtrack", "preview", "cover", "artwork"].includes(String(rawAsset.role))
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
        availability: a.availability || "full",
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
    const contentValue = isRecord(value.content) ? value.content : {};
    const textValue = contentValue.caption || contentValue.text || contentValue.title;
    const text = typeof textValue === "string" ? textValue : null;
    const authorObj = isRecord(value.author) ? value.author : {};

    return {
      id: shortcode,
      source: {
        platform: String(value.source.platform || "media"),
        url: String(value.source.url || ""),
      },
      content: {
        text,
        title: typeof contentValue.title === "string" ? contentValue.title : null,
        album: typeof contentValue.album === "string" ? contentValue.album : null,
        duration_seconds: typeof contentValue.duration_seconds === "number" ? contentValue.duration_seconds : null,
        availability: ["full", "preview", "metadata-only"].includes(String(contentValue.availability))
          ? contentValue.availability as "full" | "preview" | "metadata-only"
          : "full",
        classifications: Array.isArray(contentValue.classifications)
          ? contentValue.classifications.filter((item): item is string => typeof item === "string")
          : [],
        item_count: typeof contentValue.item_count === "number" ? contentValue.item_count : 0,
        resolved_item_count: typeof contentValue.resolved_item_count === "number"
          ? contentValue.resolved_item_count
          : 0,
        collection_truncated: contentValue.collection_truncated === true,
      },
      author: {
        name: typeof authorObj.name === "string" ? authorObj.name : null,
        username: typeof authorObj.username === "string" ? authorObj.username : null,
      },
      media: assets,
      collection: Array.isArray(value.collection)
        ? value.collection.filter((item): item is CollectionItem => (
          isRecord(item)
          && Number.isInteger(item.index)
          && typeof item.item_id === "string"
          && typeof item.title === "string"
          && ["full", "preview", "metadata-only"].includes(String(item.availability))
          && ["select-item", "processing-required", "unavailable"].includes(String(item.delivery_status))
        ))
        : [],
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
    .filter((asset): asset is MediaAsset & { role: "content" | "soundtrack" | "preview" } => (
      asset.role === "content" || asset.role === "soundtrack" || asset.role === "preview"
    ))
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
    availability: asset.availability || (asset.role === "preview" ? "preview" : "full"),
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
