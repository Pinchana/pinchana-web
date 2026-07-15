export type BuildCommit = {
  commit: string;
  repository?: string;
};

export type BuildManifest = {
  version: string;
  commits: Record<string, BuildCommit>;
};

export type DeviceSnapshot = {
  browser: string;
  platform: string;
  viewport: string;
  input: string;
  motion: string;
  connection: string;
};

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const REPOSITORY_PATTERN = /^https:\/\/github\.com\/Pinchana\/[A-Za-z0-9_.-]+$/;

export function sanitizeBuildManifest(value: unknown): BuildManifest {
  const fallback: BuildManifest = { version: "preview", commits: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const rawCommits = record.commits;
  if (!rawCommits || typeof rawCommits !== "object" || Array.isArray(rawCommits)) return fallback;

  const commits: Record<string, BuildCommit> = {};
  for (const [name, rawEntry] of Object.entries(rawCommits)) {
    if (!NAME_PATTERN.test(name) || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.commit !== "string" || !COMMIT_PATTERN.test(entry.commit)) continue;
    commits[name] = {
      commit: entry.commit.toLowerCase(),
      ...(typeof entry.repository === "string" && REPOSITORY_PATTERN.test(entry.repository) ? { repository: entry.repository } : {}),
    };
  }
  return { version: typeof record.version === "string" && record.version.length <= 24 ? record.version : "preview", commits };
}

export function identifyBrowser(userAgent: string): string {
  const match = userAgent.match(/(?:Edg|Edge)\/(\d+)/);
  if (match) return `Edge ${match[1]}`;
  const chrome = userAgent.match(/(?:Chrome|CriOS)\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const firefox = userAgent.match(/(?:Firefox|FxiOS)\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = userAgent.match(/Version\/(\d+).+Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return "Other browser";
}

export function identifyPlatform(userAgent: string): string {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS / iPadOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Other platform";
}

export function collectDeviceSnapshot(): DeviceSnapshot {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    browser: identifyBrowser(navigator.userAgent),
    platform: identifyPlatform(navigator.userAgent),
    viewport: `${window.innerWidth} × ${window.innerHeight} CSS px · ${Math.round(window.devicePixelRatio * 100) / 100}×`,
    input: navigator.maxTouchPoints > 0 ? "Touch available" : "Pointer / keyboard",
    motion: reducedMotion ? "Reduced" : "Standard",
    connection: navigator.onLine ? "Online" : "Offline",
  };
}

export function commitUrl(entry: BuildCommit): string | null {
  return entry.repository ? `${entry.repository}/commit/${entry.commit}` : null;
}
