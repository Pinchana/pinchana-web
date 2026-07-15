export type FilenameStyle = "classic" | "basic" | "pretty" | "nerdy";
export type FilenameKind = "video" | "audio" | "image" | "archive";

export const FILENAME_STYLES: { value: FilenameStyle; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "basic", label: "Basic" },
  { value: "pretty", label: "Pretty" },
  { value: "nerdy", label: "Nerdy" },
];

export const BRAND_MARK = "[pinchana.cc]";
const MAX_FILENAME_BYTES = 240;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export type FilenameMetadata = {
  title?: string | null;
  author?: string | null;
  service?: string | null;
  id?: string | null;
  quality?: string | null;
  codec?: string | null;
  kind: FilenameKind;
  index?: number | null;
};

function cleanPart(value: string | null | undefined, fallback = ""): string {
  const cleaned = (value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim();
  if (!cleaned) return fallback;
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

function machinePart(value: string | null | undefined, fallback = ""): string {
  return cleanPart(value, fallback)
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^[._-]+|[._-]+$/g, "") || fallback;
}

function machineCodec(value: string | null | undefined): string {
  return machinePart(value).replace(/\./g, "").toLowerCase();
}

function truncateUtf8(value: string, maximum: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maximum) return value;
  let output = "";
  for (const character of value) {
    if (encoder.encode(output + character).byteLength > maximum) break;
    output += character;
  }
  return output.replace(/[ ._-]+$/g, "");
}

function brandedFilename(base: string, extension: string, machine = false): string {
  const safeExtension = machinePart(extension.toLowerCase(), "bin");
  const separator = machine ? "_" : " ";
  const suffix = `${separator}${BRAND_MARK}.${safeExtension}`;
  const maximum = MAX_FILENAME_BYTES - new TextEncoder().encode(suffix).byteLength;
  const prefix = truncateUtf8(cleanPart(base, "media"), maximum) || "media";
  return `${prefix}${suffix}`;
}

function indexedHumanName(metadata: FilenameMetadata): string {
  const id = cleanPart(metadata.id, "media");
  const title = cleanPart(metadata.title, id);
  const author = cleanPart(metadata.author);
  const parts = [title, author];
  if (metadata.index && metadata.index > 0) parts.push(String(metadata.index).padStart(2, "0"));
  return parts.filter(Boolean).join(" - ");
}

export function formatFilename(metadata: FilenameMetadata, extension: string, style: FilenameStyle): string {
  const service = cleanPart(metadata.service, "pinchana").toLowerCase();
  const id = cleanPart(metadata.id, "media");
  const human = indexedHumanName(metadata);

  if (style === "classic") {
    const parts = [machinePart(service, "pinchana"), machinePart(id, "media")];
    if (metadata.index && metadata.index > 0) parts.push(String(metadata.index).padStart(2, "0"));
    if (metadata.quality) parts.push(machinePart(metadata.quality));
    if (metadata.codec) parts.push(machineCodec(metadata.codec));
    if (!metadata.quality && !metadata.codec && metadata.kind !== "archive") parts.push(metadata.kind);
    return brandedFilename(parts.filter(Boolean).join("_"), extension, true);
  }

  if (style === "basic") return brandedFilename(human, extension);

  const details = [cleanPart(metadata.quality), cleanPart(metadata.codec), service];
  if (style === "nerdy") details.push(id);
  return brandedFilename(`${human} (${details.filter(Boolean).join(", ")})`, extension);
}

export function serviceFromUrl(value: string): string {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) return "youtube";
    if (hostname.endsWith("tiktok.com")) return "tiktok";
    if (hostname.endsWith("instagram.com")) return "instagram";
    if (hostname.endsWith("threads.net") || hostname.endsWith("threads.com")) return "threads";
    if (hostname.endsWith("twitter.com") || hostname === "x.com" || hostname.endsWith(".x.com")) return "twitter";
    if (hostname.endsWith("soundcloud.com")) return "soundcloud";
    if (hostname.endsWith("spotify.com")) return "spotify";
    if (hostname.endsWith("deezer.com") || hostname.endsWith("deezer.page.link")) return "deezer";
    return hostname.split(".").at(-2) || "pinchana";
  } catch {
    return "pinchana";
  }
}

export function youtubeIdFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase().replace(/^www\./, "") === "youtu.be") {
      return cleanPart(parsed.pathname.split("/").filter(Boolean)[0], "video");
    }
    return cleanPart(parsed.searchParams.get("v"), "video");
  } catch {
    return "video";
  }
}
