"use client";

/* Authenticated media cannot use the Next image optimizer because its server-side
   fetch does not carry the visitor's HttpOnly Pinchana session cookie. */
/* eslint-disable @next/next/no-img-element */

import Script from "next/script";
import Link from "next/link";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowUp, faArrowUpRightFromSquare, faCheck, faChevronDown, faCircleInfo, faDownload, faGear, faGlobe, faLink, faMusic, faPause, faPlay, faVideo, faVolumeHigh, faVolumeXmark } from "@fortawesome/free-solid-svg-icons";
import { faDeezer, faGithub, faInstagram, faSoundcloud, faSpotify, faThreads, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Toaster, toast } from "sonner";
import CookieConsent from "./components/CookieConsent";
import type { CookieVaultHandle, VaultProfileSummary } from "./components/CookieVault";
import SettingsView, {
  DLP_CODECS,
  DLP_CONTAINERS,
  DLP_AUDIO_BITRATES,
  DLP_AUDIO_FORMATS,
  DLP_VIDEO_QUALITIES,
  DlpAudioBitrate,
  DlpAudioFormat,
  DlpCodec,
  DlpContainer,
  DlpQuality,
  SettingsSection,
} from "./components/SettingsView";
import { DlpAllocation, encryptCookiesForJob } from "@/lib/dlp-crypto";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

type MediaItem = {
  index: number;
  media_type: string;
  thumbnail_url: string;
  video_url?: string | null;
};

type TrackItem = {
  index: number;
  title: string;
  artist: string;
  audio_url: string;
};

type ScrapeResult = {
  shortcode: string;
  caption: string;
  author: string;
  media_type: string;
  thumbnail_url: string;
  video_url?: string | null;
  audio_url?: string | null;
  cover_url?: string | null;
  duration?: number | null;
  title?: string | null;
  album?: string | null;
  carousel?: MediaItem[] | null;
  tracklist?: TrackItem[] | null;
};

type DownloadAsset = { url: string; name: string; kind: "video" | "audio" | "image" };
type DownloadMode = "media" | "audio";
type GateState = "checking" | "challenge" | "verifying" | "verified" | "error";
type NotificationType = "error" | "info" | "success";
type TurnstilePhase = "background" | "interactive";
class NoAudioAvailableError extends Error {
  constructor() {
    super("No audio stream is available in this media.");
    this.name = "NoAudioAvailableError";
  }
}

const supportedPlatforms: { name: string; icon: IconDefinition }[] = [
  { name: "TikTok", icon: faTiktok },
  { name: "Instagram", icon: faInstagram },
  { name: "YouTube Shorts", icon: faYoutube },
  { name: "SoundCloud", icon: faSoundcloud },
  { name: "YouTube Music", icon: faYoutube },
  { name: "Spotify", icon: faSpotify },
  { name: "Deezer", icon: faDeezer },
  { name: "Threads", icon: faThreads },
  { name: "Twitter / X", icon: faXTwitter },
];

const MUSIC_HOSTNAMES = new Set([
  "music.youtube.com",
  "open.spotify.com",
  "deezer.com",
  "deezer.page.link",
  "link.deezer.com",
  "soundcloud.com",
]);

function isMusicUrl(value: string): boolean {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase().replace(/\.$/, "");
    return MUSIC_HOSTNAMES.has(hostname)
      || hostname.endsWith(".soundcloud.com")
      || hostname.endsWith(".deezer.com");
  } catch {
    return false;
  }
}

function isYouTubeUrl(value: string): boolean {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase().replace(/\.$/, "");
    return hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function safeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "pinchana";
}

function extension(url: string, kind: DownloadAsset["kind"]): string {
  try {
    const match = new URL(url, window.location.origin).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
  } catch {}
  return kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "jpg";
}

function turnstileErrorMessage(code: string): string {
  if (code.startsWith("300") || code.startsWith("600")) {
    return "Browser check failed. Review privacy protection, extensions, VPN, or network settings, then retry.";
  }
  if (code === "200500") return "The security check could not load. Allow challenges.cloudflare.com, then retry.";
  if (code === "110200") return "This hostname is not authorized for the security check.";
  if (code === "110600" || code === "110620") return "The security check timed out. Please retry.";
  if (code.startsWith("110") || code.startsWith("400")) return "The security check is not configured correctly.";
  return "The security check failed. Please retry.";
}



function assetsFor(result: ScrapeResult): DownloadAsset[] {
  const base = `pinchana.cc-${safeName(result.title || result.shortcode || "pinchana")}`;
  if (result.tracklist?.length) {
    return result.tracklist.map((track, index) => ({
      url: track.audio_url,
      name: `pinchana.cc-${String(index + 1).padStart(2, "0")}-${safeName(track.artist)}-${safeName(track.title)}.${extension(track.audio_url, "audio")}`,
      kind: "audio",
    }));
  }
  if (result.carousel?.length) {
    const carouselAssets = result.carousel
      .map((item, index): DownloadAsset | null => {
        const url = item.video_url || item.thumbnail_url;
        if (!url) return null;
        const kind = item.video_url ? "video" : "image";
        return {
          url,
          name: `${base}-${String(index + 1).padStart(2, "0")}.${extension(url, kind)}`,
          kind,
        };
      })
      .filter((asset): asset is DownloadAsset => asset !== null);

    const isTikTok = [result.thumbnail_url, result.audio_url, ...carouselAssets.map((asset) => asset.url)]
      .some((assetUrl) => assetUrl?.includes("/tiktok/"));
    const isImageSlideshow = carouselAssets.length > 0 && carouselAssets.every((asset) => asset.kind === "image");
    if (isTikTok && isImageSlideshow && result.audio_url) {
      carouselAssets.push({
        url: result.audio_url,
        name: `${base}-audio.${extension(result.audio_url, "audio")}`,
        kind: "audio",
      });
    }
    return carouselAssets;
  }

  const assets: DownloadAsset[] = [];
  if (result.video_url) {
    assets.push({ url: result.video_url, name: `${base}.${extension(result.video_url, "video")}`, kind: "video" });
  } else if (result.audio_url) {
    assets.push({ url: result.audio_url, name: `${base}.${extension(result.audio_url, "audio")}`, kind: "audio" });
  } else if (result.thumbnail_url) {
    assets.push({ url: result.thumbnail_url, name: `${base}.${extension(result.thumbnail_url, "image")}`, kind: "image" });
  }
  return assets;
}

function triggerSave(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

type PreparedAudio = { input: Blob; name: string; previewUrl: string };

async function prepareAudioFiles(
  items: DownloadAsset[],
  onStatus: (message: string) => void,
): Promise<{ input: Blob; name: string }[]> {
  const audioItems = items.filter((item) => item.kind === "audio");
  const candidates = audioItems.length ? audioItems : items.filter((item) => item.kind === "video");
  if (!candidates.length) throw new NoAudioAvailableError();

  const prepared: { input: Blob; name: string }[] = [];
  for (const [index, item] of candidates.entries()) {
    onStatus(`Fetching audio source ${index + 1}/${candidates.length}…`);
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`Could not fetch ${item.name}`);
    const source = await response.blob();
    const outputName = `${item.name.replace(/\.[^.]+$/, "")}.mp3`;
    if (item.kind === "audio" && item.name.toLowerCase().endsWith(".mp3")) {
      prepared.push({ input: source, name: outputName });
      continue;
    }

    const converter = await import("./lib/audio-converter");
    try {
      const sourceExtension = item.name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || "media";
      prepared.push({
        input: await converter.convertToMp3(source, sourceExtension, onStatus),
        name: outputName,
      });
    } catch (reason) {
      if (reason instanceof converter.AudioStreamUnavailableError) continue;
      throw reason;
    }
  }
  if (!prepared.length) throw new NoAudioAvailableError();
  return prepared;
}

function Icon({ name }: { name: "settings" | "services" | "info" | "arrow" | "download" | "link" | "arrowUp" | "music" | "play" | "pause" | "volume" | "mute" | "video" | "check" | "chevronDown" }) {
  const icons: Record<typeof name, IconDefinition> = {
    settings: faGear,
    services: faGlobe,
    info: faCircleInfo,
    arrow: faArrowRight,
    download: faDownload,
    link: faLink,
    arrowUp: faArrowUp,
    music: faMusic,
    play: faPlay,
    pause: faPause,
    volume: faVolumeHigh,
    mute: faVolumeXmark,
    video: faVideo,
    check: faCheck,
    chevronDown: faChevronDown,
  };
  return <FontAwesomeIcon icon={icons[name]} />;
}

export default function Home() {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState("Checking verification…");
  const [turnstileInteractive, setTurnstileInteractive] = useState(false);
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [working, setWorking] = useState(false);
  const [downloadState, setDownloadState] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [preferredDownloadMode, setPreferredDownloadMode] = useState<DownloadMode>("media");
  const [openMenu, setOpenMenu] = useState<"mode" | "services" | null>(null);
  const [flyoutLayout, setFlyoutLayout] = useState<{ side: "above" | "below"; maxHeight: number }>({ side: "below", maxHeight: 440 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [settingsMobileIndex, setSettingsMobileIndex] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideshowVolume, setSlideshowVolume] = useState(0.75);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [preparedAudio, setPreparedAudio] = useState<PreparedAudio[]>([]);
  const [preparedAudioKey, setPreparedAudioKey] = useState("");
  const [audioPreparing, setAudioPreparing] = useState(false);
  const [audioOnlyPlaying, setAudioOnlyPlaying] = useState(false);
  const [mediaFallback, setMediaFallback] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [zipMultiple, setZipMultiple] = useState(true);
  const [pawsEnabled, setPawsEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "");
  const [apiOrigin, setApiOrigin] = useState("");
  const [apiCustom, setApiCustom] = useState(false);
  const [apiStatus, setApiStatus] = useState("Connection settings are ready.");
  const [apiSaving, setApiSaving] = useState(false);
  const [dlpAvailable, setDlpAvailable] = useState(false);
  const [dlpQuality, setDlpQuality] = useState<DlpQuality>("best");
  const [dlpCodec, setDlpCodec] = useState<DlpCodec>("auto");
  const [dlpContainer, setDlpContainer] = useState<DlpContainer>("auto");
  const [dlpAudioFormat, setDlpAudioFormat] = useState<DlpAudioFormat>("mp3");
  const [dlpAudioBitrate, setDlpAudioBitrate] = useState<DlpAudioBitrate>("128");
  const [preferBetterAudio, setPreferBetterAudio] = useState(false);
  const [dubLanguage, setDubLanguage] = useState("original");
  const [dlpQualities, setDlpQualities] = useState<DlpQuality[]>([]);
  const [dlpCodecs, setDlpCodecs] = useState<DlpCodec[]>([]);
  const [dlpContainers, setDlpContainers] = useState<DlpContainer[]>([]);
  const [dlpAudioFormats, setDlpAudioFormats] = useState<DlpAudioFormat[]>([]);
  const [dlpAudioBitrates, setDlpAudioBitrates] = useState<DlpAudioBitrate[]>([]);
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
  const [betterAudioAvailable, setBetterAudioAvailable] = useState(false);
  const [vaultProfiles, setVaultProfiles] = useState<VaultProfileSummary[]>([]);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const turnstileHost = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const turnstileInteractiveRef = useRef(false);
  const turnstileErrorCodeRef = useRef<string | null>(null);
  const reportedTurnstileErrors = useRef(new Set<string>());
  const autoSaved = useRef<string | null>(null);
  const slideshowAudioRef = useRef<HTMLAudioElement>(null);
  const audioOnlyRef = useRef<HTMLAudioElement>(null);
  const preparedAudioUrls = useRef<string[]>([]);
  const downloadModeMenu = useRef<HTMLDivElement>(null);
  const servicesMenu = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const settingsReturnTitle = useRef("Pinchana");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const cookieVaultRef = useRef<CookieVaultHandle>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    document.title = settingsReturnTitle.current;
    requestAnimationFrame(() => settingsReturnFocus.current?.focus());
  }, []);

  const notify = useCallback((type: NotificationType, message: string) => {
    toast[type](message, { duration: 4_500 });
  }, []);

  const reportTurnstileError = useCallback((code: string, phase: TurnstilePhase) => {
    if (!/^\d{5,6}$/.test(code)) return;
    const diagnosticKey = `${code}:${phase}`;
    if (reportedTurnstileErrors.current.has(diagnosticKey)) return;
    reportedTurnstileErrors.current.add(diagnosticKey);
    void fetch("/api/turnstile-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, phase }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const assets = useMemo(() => result ? assetsFor(result) : [], [result]);
  const resultKey = useMemo(() => result ? JSON.stringify(result) : "", [result]);
  const musicModeLocked = useMemo(() => isMusicUrl(url), [url]);
  const downloadMode: DownloadMode = musicModeLocked ? "audio" : preferredDownloadMode;

  const displayTitle = useMemo(() => {
    if (!result) return "Untitled media";
    const text = result.title || result.caption || "Untitled media";
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }, [result]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pinchana-settings") || "{}");
      queueMicrotask(() => {
        if (typeof saved.autoSave === "boolean") setAutoSave(saved.autoSave);
        if (typeof saved.zipMultiple === "boolean") setZipMultiple(saved.zipMultiple);
        if (typeof saved.pawsEnabled === "boolean") setPawsEnabled(saved.pawsEnabled);
        if (typeof saved.reduceMotion === "boolean") setReduceMotion(saved.reduceMotion);
        if (saved.downloadMode === "media" || saved.downloadMode === "audio") setPreferredDownloadMode(saved.downloadMode);
        if (DLP_VIDEO_QUALITIES.some((option) => option.value === saved.dlpQuality)) setDlpQuality(saved.dlpQuality);
        if (DLP_CODECS.some((option) => option.value === saved.dlpCodec)) setDlpCodec(saved.dlpCodec);
        if (DLP_CONTAINERS.some((option) => option.value === saved.dlpContainer)) setDlpContainer(saved.dlpContainer);
        if (DLP_AUDIO_FORMATS.some((option) => option.value === saved.dlpAudioFormat)) setDlpAudioFormat(saved.dlpAudioFormat);
        if (DLP_AUDIO_BITRATES.some((option) => option.value === saved.dlpAudioBitrate)) setDlpAudioBitrate(saved.dlpAudioBitrate);
        if (typeof saved.preferBetterAudio === "boolean") setPreferBetterAudio(saved.preferBetterAudio);
        if (typeof saved.dubLanguage === "string") setDubLanguage(saved.dubLanguage);
      });
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave, zipMultiple, pawsEnabled, reduceMotion, downloadMode: preferredDownloadMode, dlpQuality, dlpCodec, dlpContainer, dlpAudioFormat, dlpAudioBitrate, preferBetterAudio, dubLanguage }));
  }, [autoSave, dlpAudioBitrate, dlpAudioFormat, dlpCodec, dlpContainer, dlpQuality, dubLanguage, preferBetterAudio, zipMultiple, pawsEnabled, preferredDownloadMode, reduceMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle("paws-disabled", !pawsEnabled);
    document.documentElement.classList.toggle("motion-disabled", reduceMotion);
  }, [pawsEnabled, reduceMotion]);

  useEffect(() => {
    void import("./lib/audio-converter")
      .then(({ preloadAudioEngine }) => preloadAudioEngine())
      .catch((reason) => console.error("pinchana_audio_engine_preload_failed", reason));
  }, []);

  useEffect(() => () => {
    for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
  }, []);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      for (const menu of [downloadModeMenu, servicesMenu]) {
        if (menu.current?.contains(target)) return;
      }
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  useEffect(() => {
    const pasteIntoUrlBar = (event: ClipboardEvent) => {
      if (settingsOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea"))) return;
      const pasted = event.clipboardData?.getData("text/plain").trim();
      if (!pasted) return;
      event.preventDefault();
      setUrl(pasted);
      if (isMusicUrl(pasted)) setOpenMenu(null);
      queueMicrotask(() => {
        const input = urlInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(pasted.length, pasted.length);
      });
    };
    window.addEventListener("paste", pasteIntoUrlBar);
    return () => window.removeEventListener("paste", pasteIntoUrlBar);
  }, [settingsOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (settingsOpen) {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (openMenu) {
        event.preventDefault();
        setOpenMenu(null);
        return;
      }
      if (!result) return;
      event.preventDefault();
      const closeViewer = () => {
        for (const audio of [slideshowAudioRef.current, audioOnlyRef.current]) {
          if (!audio) continue;
          audio.pause();
          audio.currentTime = 0;
        }
        for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
        preparedAudioUrls.current = [];
        setSlideshowPlaying(false);
        setAudioOnlyPlaying(false);
        setAudioPreparing(false);
        setPreparedAudio([]);
        setPreparedAudioKey("");
        setMediaFallback(false);
        setActiveSlide(0);
        setDownloadState("");
        setResult(null);
      };
      if (!reduceMotion && document.startViewTransition) {
        document.startViewTransition(() => flushSync(closeViewer));
      } else {
        closeViewer();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeSettings, openMenu, reduceMotion, result, settingsOpen]);

  const checkSession = useCallback(async () => {
    turnstileInteractiveRef.current = false;
    turnstileErrorCodeRef.current = null;
    setTurnstileInteractive(false);
    setTurnstileErrorCode(null);
    setGate("checking");
    setGateMessage("Checking verification…");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.valid) {
        setExpiresAt(typeof payload.expires_at === "number" ? payload.expires_at : null);
        setGate("verified");
        setGateMessage("Verified");
      } else if (response.status === 401) {
        setGate("challenge");
        setGateMessage("Complete the check to unlock");
      } else {
        throw new Error();
      }
    } catch {
      setGate("error");
      setGateMessage("Verification service unavailable");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/instance", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Instance configuration is unavailable");
        if (!active) return;
        setApiCustom(payload.custom === true);
        setApiOrigin(payload.custom && typeof payload.origin === "string" ? payload.origin : "");
        setApiStatus("Connection settings are ready.");
        if (typeof payload.turnstile_site_key === "string") setTurnstileSiteKey(payload.turnstile_site_key);
      } catch (reason) {
        if (active) setApiStatus(reason instanceof Error ? reason.message : "Instance configuration is unavailable");
      } finally {
        if (active) setInstanceReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (instanceReady) queueMicrotask(() => void checkSession());
  }, [checkSession, instanceReady]);

  useEffect(() => {
    if (gate !== "verified") return;
    let active = true;
    void fetch("/api/capabilities", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        const capability = payload?.dlp;
        setDlpAvailable(capability?.available === true && capability?.protocol === 2);
        setDlpQualities(Array.isArray(capability?.qualities) ? capability.qualities.filter((value: unknown): value is DlpQuality => typeof value === "string" && [...DLP_VIDEO_QUALITIES.map((option) => option.value), "audio"].includes(value as DlpQuality)) : []);
        setDlpCodecs(Array.isArray(capability?.codecs) ? capability.codecs.filter((value: unknown): value is DlpCodec => typeof value === "string" && DLP_CODECS.some((option) => option.value === value)) : []);
        setDlpContainers(Array.isArray(capability?.containers) ? capability.containers.filter((value: unknown): value is DlpContainer => typeof value === "string" && DLP_CONTAINERS.some((option) => option.value === value)) : []);
        setDlpAudioFormats(Array.isArray(capability?.audioFormats) ? capability.audioFormats.filter((value: unknown): value is DlpAudioFormat => typeof value === "string" && DLP_AUDIO_FORMATS.some((option) => option.value === value)) : []);
        setDlpAudioBitrates(Array.isArray(capability?.audioBitrates) ? capability.audioBitrates.filter((value: unknown): value is DlpAudioBitrate => typeof value === "string" && DLP_AUDIO_BITRATES.some((option) => option.value === value)) : []);
        setDubLanguages(Array.isArray(capability?.dubLanguages) ? capability.dubLanguages.filter((value: unknown): value is string => typeof value === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) : []);
        setBetterAudioAvailable(capability?.betterAudio === true);
      })
      .catch(() => {
        if (!active) return;
        setDlpAvailable(false);
        setDlpQualities([]);
        setDlpCodecs([]);
        setDlpContainers([]);
        setDlpAudioFormats([]);
        setDlpAudioBitrates([]);
        setDubLanguages([]);
        setBetterAudioAvailable(false);
      });
    return () => { active = false; };
  }, [gate, apiStatus]);

  useEffect(() => {
    if (!expiresAt || gate !== "verified") return;
    const delay = Math.max(0, expiresAt * 1000 - Date.now());
    const timeout = window.setTimeout(() => {
      setGate("challenge");
      setGateMessage("Session expired — verify again");
      setResult(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAt, gate]);

  useEffect(() => {
    const host = turnstileHost.current;
    const sitekey = turnstileSiteKey;
    if (gate !== "challenge" || !scriptReady || !host || !window.turnstile || widgetId.current) return;
    if (!sitekey) {
      queueMicrotask(() => {
        setGate("error");
        setGateMessage("Turnstile site key is not configured");
      });
      return;
    }

    reportedTurnstileErrors.current.clear();
    const setInteractionVisible = (visible: boolean) => {
      turnstileInteractiveRef.current = visible;
      setTurnstileInteractive(visible);
    };

    widgetId.current = window.turnstile.render(host, {
      sitekey,
      theme: "dark",
      size: "flexible",
      appearance: "interaction-only",
      action: "turnstile-spin-v1",
      "before-interactive-callback": () => {
        turnstileErrorCodeRef.current = null;
        setTurnstileErrorCode(null);
        setGateMessage("Complete the check to unlock");
        setInteractionVisible(true);
      },
      "after-interactive-callback": () => {
        if (!turnstileErrorCodeRef.current) setInteractionVisible(false);
      },
      callback: async (token: string) => {
        setInteractionVisible(false);
        turnstileErrorCodeRef.current = null;
        setTurnstileErrorCode(null);
        setGate("verifying");
        setGateMessage("Verifying…");
        try {
          const response = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Verification failed");
          setExpiresAt(typeof payload.expiresAt === "number" ? payload.expiresAt : null);
          setGate("verified");
          setGateMessage("Verified");
        } catch (reason) {
          setGate("challenge");
          setGateMessage(reason instanceof Error ? reason.message : "Verification failed");
          if (widgetId.current) window.turnstile?.reset(widgetId.current);
        }
      },
      "expired-callback": () => {
        setInteractionVisible(false);
        turnstileErrorCodeRef.current = null;
        setTurnstileErrorCode(null);
        setGate("challenge");
        setGateMessage("Check expired — try again");
      },
      "timeout-callback": () => {
        reportTurnstileError("110620", "interactive");
        turnstileErrorCodeRef.current = "110620";
        setTurnstileErrorCode("110620");
        setGate("challenge");
        setGateMessage("The security check timed out. Please retry.");
        setInteractionVisible(true);
      },
      "unsupported-callback": () => {
        turnstileErrorCodeRef.current = "unsupported";
        setTurnstileErrorCode("unsupported");
        setGate("challenge");
        setGateMessage("This browser is not supported by the security check.");
        setInteractionVisible(true);
      },
      "error-callback": (errorCode: string) => {
        const code = typeof errorCode === "string" ? errorCode : "unknown";
        const phase: TurnstilePhase = turnstileInteractiveRef.current ? "interactive" : "background";
        reportTurnstileError(code, phase);
        turnstileErrorCodeRef.current = code;
        setTurnstileErrorCode(code);
        setGate("challenge");
        setGateMessage(turnstileErrorMessage(code));
        setInteractionVisible(true);
        return true;
      },
    });

    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      turnstileInteractiveRef.current = false;
      turnstileErrorCodeRef.current = null;
    };
  }, [gate, reportTurnstileError, scriptReady, turnstileSiteKey]);

  const retryTurnstile = useCallback(() => {
    turnstileErrorCodeRef.current = null;
    setTurnstileErrorCode(null);
    turnstileInteractiveRef.current = false;
    setTurnstileInteractive(false);
    setGateMessage("Retrying security check…");
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      return;
    }
    void checkSession();
  }, [checkSession]);

  async function applyApiOrigin(nextOrigin: string) {
    if (apiSaving) return;
    setApiSaving(true);
    setApiStatus(nextOrigin.trim() ? "Verifying signed instance…" : "Restoring default API…");
    try {
      let response: Response;
      if (!nextOrigin.trim()) {
        response = await fetch("/api/instance", { method: "DELETE" });
      } else {
        const parsed = new URL(nextOrigin.trim());
        const origin = parsed.origin;
        if (parsed.toString() !== `${origin}/` && parsed.toString() !== origin) {
          throw new Error("Enter only the API origin, without a path.");
        }
        const identityResponse = await fetch(`${origin}/web/identity`, { cache: "no-store", mode: "cors" });
        const certificate = await identityResponse.json().catch(() => null);
        if (!identityResponse.ok) throw new Error("This server did not provide a Pinchana instance certificate.");
        response = await fetch("/api/instance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, certificate }),
        });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Instance verification failed.");
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      setTurnstileSiteKey(typeof payload.turnstile_site_key === "string" ? payload.turnstile_site_key : "");
      setApiCustom(payload.custom === true);
      setApiOrigin(payload.custom && typeof payload.origin === "string" ? payload.origin : "");
      setApiStatus(payload.custom ? "Custom instance connected. Capabilities refreshed." : "Default instance restored. Capabilities refreshed.");
      setExpiresAt(null);
      setResult(null);
      setGate("checking");
      setGateMessage("Checking verification…");
      await checkSession();
    } catch (reason) {
      setApiStatus(reason instanceof Error ? reason.message : "Instance verification failed.");
    } finally {
      setApiSaving(false);
    }
  }

  function saveApiOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyApiOrigin(apiOrigin);
  }

  function useDefaultApiOrigin() {
    setApiOrigin("");
    void applyApiOrigin("");
  }

  useEffect(() => {
    if (!result || downloadMode !== "audio" || !assets.length || preparedAudioKey === resultKey) return;
    let cancelled = false;
    for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
    preparedAudioUrls.current = [];
    queueMicrotask(() => {
      if (cancelled) return;
      setPreparedAudio([]);
      setPreparedAudioKey("");
      setAudioPreparing(true);
      setMediaFallback(false);
      setDownloadState("Preparing audio…");
    });

    void prepareAudioFiles(assets, (message) => {
      if (!cancelled) setDownloadState(message);
    }).then((files) => {
      if (cancelled) return;
      const ready = files.map((file) => ({ ...file, previewUrl: URL.createObjectURL(file.input) }));
      preparedAudioUrls.current = ready.map((file) => file.previewUrl);
      setPreparedAudio(ready);
      setPreparedAudioKey(resultKey);
      setDownloadState("");
    }).catch((reason) => {
      if (cancelled) return;
      if (reason instanceof NoAudioAvailableError) {
        if (musicModeLocked) {
          setMediaFallback(true);
          setDownloadState("");
          notify("error", "No audio track was found for this music link.");
          return;
        }
        autoSaved.current = `${resultKey}:media`;
        setMediaFallback(true);
        setPreferredDownloadMode("media");
        setDownloadState("");
        notify("info", "No audio track was found. Switched to the original media.");
        return;
      }
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error("pinchana_audio_preparation_failed", reason);
      setDownloadState("");
      notify("error", `Audio conversion failed: ${message}`);
    }).finally(() => {
      if (!cancelled) setAudioPreparing(false);
    });

    return () => { cancelled = true; };
  }, [assets, downloadMode, musicModeLocked, notify, preparedAudioKey, result, resultKey]);

  const downloadAssets = useCallback(async (
    items: DownloadAsset[],
    archiveName: string,
    mode: DownloadMode,
    currentResultKey = "",
  ) => {
    if (!items.length || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadState(mode === "audio" ? "Preparing audio…" : "Preparing download…");
    try {
      if (mode === "audio") {
        if (preparedAudioKey !== currentResultKey || !preparedAudio.length) {
          throw new Error(audioPreparing ? "Audio is still being prepared." : "Audio preparation did not complete.");
        }
        const prepared = preparedAudio;
        if (prepared.length > 1 && zipMultiple) {
          const { downloadZip } = await import("client-zip");
          const blob = await downloadZip(prepared).blob();
          triggerSave(blob, `pinchana.cc-${safeName(archiveName)}-audio.zip`);
        } else {
          for (const item of prepared) triggerSave(item.input, item.name);
        }
      } else if (items.length > 1 && zipMultiple) {
        const { downloadZip } = await import("client-zip");
        const inputs = await Promise.all(items.map(async (item) => {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(`Could not fetch ${item.name}`);
          return { input: response, name: item.name };
        }));
        const blob = await downloadZip(inputs).blob();
        triggerSave(blob, `pinchana.cc-${safeName(archiveName)}.zip`);
      } else {
        for (const item of items) {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(`Could not fetch ${item.name}`);
          triggerSave(await response.blob(), item.name);
        }
      }
      setDownloadState("");
      notify("success", "Download saved.");
    } catch (reason) {
      if (reason instanceof NoAudioAvailableError) {
        if (musicModeLocked) {
          setDownloadState("");
          notify("error", "No audio track was found for this music link.");
          return;
        }
        if (currentResultKey) autoSaved.current = `${currentResultKey}:media`;
        setPreferredDownloadMode("media");
        setDownloadState("");
        notify("info", "No audio track was found. Switched to the original media.");
      } else {
        const message = reason instanceof Error ? reason.message : "Download failed";
        console.error("pinchana_download_failed", reason);
        setDownloadState("");
        notify("error", `Download failed: ${message}`);
      }
    } finally {
      setDownloadBusy(false);
    }
  }, [audioPreparing, downloadBusy, musicModeLocked, notify, preparedAudio, preparedAudioKey, zipMultiple]);

  useEffect(() => {
    if (!result || !autoSave || !assets.length) return;
    if (downloadMode === "audio" && (audioPreparing || preparedAudioKey !== resultKey || !preparedAudio.length)) return;
    const key = `${resultKey}:${downloadMode}`;
    if (autoSaved.current === key) return;
    autoSaved.current = key;
    void downloadAssets(assets, result.title || result.shortcode, downloadMode, resultKey);
  }, [assets, audioPreparing, autoSave, downloadAssets, downloadMode, preparedAudio.length, preparedAudioKey, result, resultKey]);

  async function responsePayload(response: Response): Promise<Record<string, unknown>> {
    try { return await response.json() as Record<string, unknown>; } catch { return {}; }
  }

  async function runDlpDownload(targetUrl: string) {
    if (!dlpAvailable) throw new Error("YouTube downloads are not available on this API instance.");
    setDownloadState("Allocating an isolated worker…");
    const allocationResponse = await fetch("/api/dlp/jobs", { method: "POST" });
    const allocationPayload = await responsePayload(allocationResponse);
    if (!allocationResponse.ok) throw new Error(String(allocationPayload.error || "Could not allocate a private worker."));
    const allocation = allocationPayload as unknown as DlpAllocation;
    if (!allocation.jobId || !allocation.keyId || !allocation.workerPubKey) throw new Error("The private worker returned an invalid allocation.");

    let cookiesEnc;
    if (selectedProfileId) {
      setDownloadState("Encrypting cookies in this browser…");
      const plaintext = cookieVaultRef.current?.selectedCookiesForUrl(selectedProfileId, targetUrl);
      if (!plaintext) throw new Error("Unlock the Cookie Vault and select a profile.");
      try { cookiesEnc = await encryptCookiesForJob(allocation, plaintext); }
      finally { plaintext.fill(0); }
    }
    const quality: DlpQuality = (isMusicUrl(targetUrl) || downloadMode === "audio")
      ? "audio"
      : dlpQualities.includes(dlpQuality) ? dlpQuality : "best";
    const formatOptions = dlpCodecs.length && dlpContainers.length
      ? {
          codec: dlpCodecs.includes(dlpCodec) ? dlpCodec : "auto",
          container: dlpContainers.includes(dlpContainer) ? dlpContainer : "auto",
        }
      : {};
    const audioOptions = quality === "audio" && dlpAudioFormats.length
      ? {
          audioFormat: dlpAudioFormats.includes(dlpAudioFormat) ? dlpAudioFormat : "best",
          ...(
            dlpAudioBitrates.length && !["best", "wav"].includes(dlpAudioFormat)
              ? { audioBitrate: dlpAudioBitrates.includes(dlpAudioBitrate) ? dlpAudioBitrate : "128" }
              : {}
          ),
        }
      : {};
    const youtubeAudioOptions = {
      ...(betterAudioAvailable ? { preferBetterAudio } : {}),
      ...(dubLanguages.length ? { dubLanguage: dubLanguages.includes(dubLanguage) ? dubLanguage : "original" } : {}),
    };
    setDownloadState("Submitting encrypted job…");
    const submitResponse = await fetch(`/api/dlp/jobs/${allocation.jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, quality, ...formatOptions, ...audioOptions, ...youtubeAudioOptions, ...(cookiesEnc ? { cookiesEnc } : {}) }),
    });
    const submitPayload = await responsePayload(submitResponse);
    if (!submitResponse.ok) throw new Error(String(submitPayload.error || "Private job submission failed."));

    while (true) {
      if (Date.now() >= allocation.expiresAt * 1000) throw new Error("The private worker key expired. Retry to allocate a new worker.");
      await new Promise((resolve) => window.setTimeout(resolve, 1_250));
      const statusResponse = await fetch(`/api/dlp/jobs/${allocation.jobId}`, { cache: "no-store" });
      const status = await responsePayload(statusResponse);
      if (!statusResponse.ok) throw new Error(String(status.error || "Private download status failed."));
      if (status.status === "FAILED" || status.status === "EXPIRED") throw new Error(String(status.error || "Private download failed."));
      if (status.status === "READY") break;
      const progress = typeof status.progress === "number" ? ` ${Math.round(status.progress)}%` : "";
      setDownloadState(`${String(status.stage || status.status || "queued").replaceAll("_", " ")}…${progress}`);
    }

    setDownloadState("Streaming completed file…");
    const fileResponse = await fetch(`/api/dlp/jobs/${allocation.jobId}/file`, { cache: "no-store" });
    if (!fileResponse.ok) throw new Error(String((await responsePayload(fileResponse)).error || "Private download file is unavailable."));
    const total = Number(fileResponse.headers.get("content-length") || 0);
    const reader = fileResponse.body?.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Uint8Array.from(value)); received += value.byteLength;
        if (total) setDownloadState(`Streaming completed file… ${Math.min(100, Math.round(received / total * 100))}%`);
      }
    }
    const disposition = fileResponse.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)?.[1] || `pinchana-private-${allocation.jobId}.bin`;
    triggerSave(new Blob(chunks, { type: fileResponse.headers.get("content-type") || "application/octet-stream" }), decodeURIComponent(filename));
    setDownloadState("Private download complete.");
    notify("success", "Private download completed.");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (gate !== "verified" || working) return;
    setDownloadState("");
    try {
      const parsed = new URL(url);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    } catch {
      notify("error", "Enter a valid public URL.");
      return;
    }

    const enterLoadingState = () => {
      for (const audio of [slideshowAudioRef.current, audioOnlyRef.current]) {
        if (!audio) continue;
        audio.pause();
        audio.currentTime = 0;
      }
      for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
      preparedAudioUrls.current = [];
      setPreparedAudio([]);
      setPreparedAudioKey("");
      setAudioPreparing(false);
      setAudioOnlyPlaying(false);
      setMediaFallback(false);
      setResult(null);
      setActiveSlide(0);
      setSlideshowPlaying(false);
      setWorking(true);
    };
    if (!reduceMotion && document.startViewTransition) {
      const transition = document.startViewTransition(() => flushSync(enterLoadingState));
      await transition.updateCallbackDone;
    } else {
      enterLoadingState();
    }
    try {
      if (isYouTubeUrl(url)) {
        await runDlpDownload(url);
        return;
      }
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setGate("challenge");
          setGateMessage("Session expired — verify again");
        }
        throw new Error(payload.error || "Could not process this URL.");
      }
      autoSaved.current = null;
      setActiveSlide(0);
      setResult(payload as ScrapeResult);
    } catch (reason) {
      setResult(null);
      notify("error", reason instanceof Error ? reason.message : "Could not process this URL.");
    } finally {
      setWorking(false);
    }
  }

  const previewAssets = result?.carousel?.length
    ? assets.filter((asset) => asset.kind !== "audio")
    : assets;
  const slideshowAudio = result?.carousel?.length
    ? assets.find((asset) => asset.kind === "audio")
    : undefined;
  const showAudioOnly = downloadMode === "audio";

  function moveSlide(direction: -1 | 1) {
    setActiveSlide((current) => (current + direction + previewAssets.length) % previewAssets.length);
  }

  function toggleSlideshowAudio() {
    const audio = slideshowAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      void audio.play();
    } else {
      audio.pause();
      audio.currentTime = 0;
      setSlideshowPlaying(false);
    }
  }

  function toggleAudioOnlyPreview() {
    const audio = audioOnlyRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      void audio.play();
    } else {
      audio.pause();
      audio.currentTime = 0;
      setAudioOnlyPlaying(false);
    }
  }

  function toggleFlyout(
    menu: "mode" | "services",
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (menu === "mode" && musicModeLocked) return;
    setSettingsOpen(false);
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const desiredHeight = menu === "mode" ? 118 : 300;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 18);
    const spaceAbove = Math.max(0, rect.top - 18);
    const minimumUsefulSpace = Math.min(desiredHeight, menu === "mode" ? 118 : 240);
    const side = spaceBelow >= minimumUsefulSpace || spaceBelow >= spaceAbove ? "below" : "above";
    setFlyoutLayout({
      side,
      maxHeight: Math.max(80, Math.floor((side === "below" ? spaceBelow : spaceAbove) - 12)),
    });
    setOpenMenu(menu);
  }

  function openSettings(section?: SettingsSection) {
    const trigger = settingsTrigger.current;
    settingsReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
    if (!settingsOpen) settingsReturnTitle.current = document.title;
    setOpenMenu(null);
    if (section) setSettingsSection(section);
    const showMobileIndex = !section && window.matchMedia("(max-width: 700px)").matches;
    setSettingsMobileIndex(showMobileIndex);
    setSettingsOpen(true);
    document.title = "Settings · Pinchana";
    requestAnimationFrame(() => {
      const focusId = showMobileIndex ? "settings-index-title" : `settings-title-${section ?? settingsSection}`;
      document.getElementById(focusId)?.focus();
    });
  }

  function renderPreview(asset: DownloadAsset, index: number) {
    if (asset.kind === "video") {
      return <video key={asset.url} src={asset.url} controls playsInline preload="metadata" />;
    }
    if (asset.kind === "audio") {
      return (
        <div className="audio-preview" key={asset.url}>
          {result?.cover_url || result?.thumbnail_url ? <img src={result.cover_url || result.thumbnail_url} alt="Cover art" /> : <div className="audio-glyph">♪</div>}
          <audio src={asset.url} controls preload="metadata" />
        </div>
      );
    }
    return <img key={asset.url} src={asset.url} alt={`Media ${index + 1}`} />;
  }

  return (
    <main className="app-shell" data-view={settingsOpen ? "settings" : "workspace"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <div className="primary-view" inert={settingsOpen ? true : undefined} aria-hidden={settingsOpen}>

      <header className={`brand-block ${working || result ? "is-hidden" : ""}`}>
        <div className="brand-mark" aria-hidden="true" style={{ color: "#fff" }}>
          <svg className="brand-logo" viewBox="0 0 512 512" width="22" height="22" fill="currentColor">
            <path d="M461.814,197.514c-2.999-11.335-14.624-18.093-25.958-15.094c-1.866,0.553-13.477,3.649-26.042,14.341c-6.234,5.349-12.633,12.751-17.361,22.454c-4.748,9.69-7.685,21.577-7.657,35.033c0.013,16.345,4.133,34.895,13.442,56.257c6.282,14.403,9.144,29.697,9.144,44.846c0.062,25.627-8.438,50.756-21.121,68.283c-6.296,8.777-13.546,15.606-20.816,20.022c-2.986,1.81-5.943,3.131-8.888,4.181l0.989-5.854c-0.055-17.03-4.05-34.84-13.021-50.528c-28.356-49.643-66.223-134.741-66.223-134.741l-1.527-4.879c29.47-7.796,58.579-23.408,73.148-54.985c38.931-84.344-41.08-142.73-41.08-142.73s-25.958-56.222-38.924-54.06c-12.978,2.164-41.094,38.931-41.094,38.931h-23.788h-23.788c0,0-28.108-36.767-41.08-38.931c-12.979-2.163-38.924,54.06-38.924,54.06s-80.018,58.386-41.087,142.73c13.822,29.953,40.741,45.572,68.634,53.748l-2.951,9.662c0,0-31.908,81.552-60.279,131.195C37.198,441.092,58.478,512,97.477,512c29.47,0,79.14,0,101.692,0c7.292,0,11.763,0,11.763,0c22.544,0,72.222,0,101.691,0c12.654,0,23.38-7.547,31.204-19.324c15.826-0.013,30.81-4.872,43.707-12.758c19.455-11.915,34.708-30.32,45.434-51.896c10.685-21.618,16.856-46.636,16.878-72.672c0-20.484-3.885-41.619-12.682-61.813c-7.561-17.34-9.918-30.216-9.904-39.29c0.028-7.526,1.5-12.544,3.359-16.414c1.417-2.889,3.124-5.17,4.983-7.091c2.771-2.868,5.964-4.879,8.349-6.054c1.182-0.595,2.135-0.968,2.674-1.162l0.449-0.152l-0.007-0.028C458.179,220.189,464.779,208.724,461.814,197.514z"/>
          </svg>
        </div>
        <div>
          <h1>Pinchana</h1>
        </div>
      </header>

      <div
        className={`turnstile-layer ${gate === "challenge" && turnstileInteractive ? "is-interactive" : ""}`}
        role={gate === "challenge" && turnstileInteractive ? "dialog" : undefined}
        aria-modal={gate === "challenge" && turnstileInteractive ? true : undefined}
        aria-label={gate === "challenge" && turnstileInteractive ? "Security verification" : undefined}
        aria-hidden={gate !== "challenge" || !turnstileInteractive}
      >
        <div className="turnstile-panel">
          {gate === "challenge" && turnstileInteractive && (
            <p className="turnstile-message" role={turnstileErrorCode ? "alert" : "status"}>{gateMessage}</p>
          )}
          <div ref={turnstileHost} className="turnstile-host" />
          {gate === "challenge" && turnstileInteractive && turnstileErrorCode && (
            <button className="turnstile-retry" type="button" onClick={retryTurnstile}>Retry security check</button>
          )}
        </div>
      </div>

      <section className={`workspace ${working || result ? "has-result" : ""} ${working ? "is-loading" : ""}`}>
        <p className="sr-only" aria-live="polite">{gateMessage}</p>

        {(working || result) && (
          <div className={`result-slot ${downloadMode === "audio" ? "audio-result-slot" : ""}`}>
          {working ? (
            <article className="result-card loading-card" aria-live="polite" aria-label="Fetching media">
            <div className="media-loading">
              <span className="media-loading-spinner" aria-hidden="true" />
              <div className="fetch-placeholder-copy">
                <p>{isYouTubeUrl(url) ? "YouTube download" : "Fetching media"}</p>
                <small>{downloadState || "Pinchana is preparing your link…"}</small>
              </div>
            </div>
            <div className="loading-footer" aria-hidden="true">
              <div>
                <span />
                <span />
              </div>
              <span className="loading-button" />
            </div>
            </article>
          ) : result ? (

            <article className={`result-card ${showAudioOnly ? "audio-result-card" : ""}`}>
            <div
              className={`media-stage ${!showAudioOnly && previewAssets.length > 1 ? "carousel-stage" : ""} ${showAudioOnly ? "audio-only-stage" : ""} ${mediaFallback ? "media-fallback" : ""}`}
              tabIndex={!showAudioOnly && previewAssets.length > 1 ? 0 : undefined}
              aria-label={!showAudioOnly && previewAssets.length > 1 ? `Media carousel, item ${activeSlide + 1} of ${previewAssets.length}` : undefined}
              onKeyDown={(event) => {
                if (!showAudioOnly && event.key === "ArrowLeft" && previewAssets.length > 1) moveSlide(-1);
                if (!showAudioOnly && event.key === "ArrowRight" && previewAssets.length > 1) moveSlide(1);
              }}
            >
              {showAudioOnly ? (
                <div className="audio-only-view" aria-live="polite">
                  {audioPreparing ? (
                    <div className="audio-only-loading">
                      <span className="media-loading-spinner" />
                      <strong>Preparing audio</strong>
                      <small>{downloadState}</small>
                    </div>
                  ) : preparedAudio[0] ? (
                    <div className="audio-only-player">
                      <div className="audio-only-art" aria-hidden="true"><Icon name="music" /></div>
                      <div className="audio-only-copy">
                        <strong>Audio</strong>
                        <small>{preparedAudio.length} file{preparedAudio.length === 1 ? "" : "s"}</small>
                      </div>
                      <div className="audio-only-controls">
                        <button type="button" onClick={toggleAudioOnlyPreview} aria-label={audioOnlyPlaying ? "Stop audio preview" : "Play audio preview"}>
                          <Icon name={audioOnlyPlaying ? "pause" : "play"} />
                        </button>
                        <label>
                          <Icon name={slideshowVolume === 0 ? "mute" : "volume"} />
                          <span className="sr-only">Audio preview volume</span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={slideshowVolume}
                            onChange={(event) => {
                              const volume = Number(event.target.value);
                              setSlideshowVolume(volume);
                              if (audioOnlyRef.current) audioOnlyRef.current.volume = volume;
                            }}
                          />
                        </label>
                      </div>
                      <audio
                        ref={audioOnlyRef}
                        src={preparedAudio[0].previewUrl}
                        preload="metadata"
                        onLoadedMetadata={(event) => { event.currentTarget.volume = slideshowVolume; }}
                        onPlay={() => setAudioOnlyPlaying(true)}
                        onPause={() => setAudioOnlyPlaying(false)}
                        onEnded={(event) => {
                          event.currentTarget.currentTime = 0;
                          setAudioOnlyPlaying(false);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="audio-only-loading"><Icon name="music" /><strong>Audio unavailable</strong></div>
                  )}
                </div>
              ) : previewAssets.length > 1 ? (
                <>
                  <div
                    className="carousel-track"
                    style={{ transform: `translate3d(-${activeSlide * 100}%, 0, 0)` }}
                  >
                    {previewAssets.map((asset, index) => (
                      <div className="carousel-slide" key={asset.url} aria-hidden={index !== activeSlide}>
                        {renderPreview(asset, index)}
                      </div>
                    ))}
                  </div>
                  <span className="carousel-count">{activeSlide + 1} / {previewAssets.length}</span>
                  <button type="button" className="carousel-control previous" aria-label="Previous media" onClick={() => moveSlide(-1)}><Icon name="arrow" /></button>
                  <button type="button" className="carousel-control next" aria-label="Next media" onClick={() => moveSlide(1)}><Icon name="arrow" /></button>
                  <div className="carousel-dots" aria-label="Choose media item">
                    {previewAssets.map((asset, index) => (
                      <button
                        type="button"
                        key={asset.url}
                        className={index === activeSlide ? "active" : ""}
                        aria-label={`Show media ${index + 1}`}
                        aria-current={index === activeSlide ? "true" : undefined}
                        onClick={() => setActiveSlide(index)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                previewAssets[0] && renderPreview(previewAssets[0], 0)
              )}
            </div>

            <div className="result-footer" aria-live="polite">
              <div className="result-summary">
                <h2>{displayTitle}</h2>
                <p>
                  {result.author && <span>by {result.author}</span>}
                  {result.author && <span aria-hidden="true"> · </span>}
                  <span>{assets.length} file{assets.length === 1 ? "" : "s"}{assets.length > 1 && zipMultiple ? " · ZIP" : ""}</span>
                </p>
              </div>
              {slideshowAudio && !showAudioOnly && (
                <div className="slideshow-audio" tabIndex={0} title="Preview slideshow audio">
                  <span className="slideshow-audio-mark" aria-hidden="true"><Icon name="music" /></span>
                  <div className="slideshow-audio-controls">
                    <button type="button" onClick={toggleSlideshowAudio} aria-label={slideshowPlaying ? "Stop slideshow audio" : "Play slideshow audio"}>
                      <Icon name={slideshowPlaying ? "pause" : "play"} />
                    </button>
                    <label className="slideshow-volume">
                      <Icon name={slideshowVolume === 0 ? "mute" : "volume"} />
                      <span className="sr-only">Slideshow volume</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={slideshowVolume}
                        onChange={(event) => {
                          const volume = Number(event.target.value);
                          setSlideshowVolume(volume);
                          if (slideshowAudioRef.current) slideshowAudioRef.current.volume = volume;
                        }}
                        aria-label="Slideshow volume"
                      />
                    </label>
                  </div>
                  <audio
                    ref={slideshowAudioRef}
                    src={slideshowAudio.url}
                    preload="metadata"
                    className="slideshow-audio-element"
                    onLoadedMetadata={(event) => {
                      event.currentTarget.volume = slideshowVolume;
                    }}
                    onPlay={() => setSlideshowPlaying(true)}
                    onPause={() => setSlideshowPlaying(false)}
                    onEnded={(event) => {
                      event.currentTarget.currentTime = 0;
                      setSlideshowPlaying(false);
                    }}
                    onVolumeChange={(event) => setSlideshowVolume(event.currentTarget.volume)}
                  />
                </div>
              )}
              <button
                className="download-action"
                aria-label={downloadMode === "audio" ? "Download audio only" : "Download media"}
                title={downloadMode === "audio" ? "Download audio only" : "Download media"}
                onClick={() => void downloadAssets(assets, result.title || result.shortcode, downloadMode, resultKey)}
                disabled={!assets.length || downloadBusy || audioPreparing || (showAudioOnly && !preparedAudio.length)}
              >
                {downloadBusy ? <span className="button-spinner" /> : <Icon name="download" />}
                <span>Save</span>
              </button>
            </div>
            </article>
          ) : null}
          </div>
        )}

        {isYouTubeUrl(url) && (
          <div className="dlp-job-options" role="group" aria-label="YouTube download options">
            <span>YouTube uses an isolated worker</span>
            <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} disabled={!dlpAvailable || !vaultUnlocked} aria-label="Cookie profile">
              <option value="">Anonymous (no cookies)</option>
              {vaultProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.domains.join(", ")}</option>)}
            </select>
            <button className="dlp-settings-shortcut" type="button" onClick={() => openSettings("youtube")} aria-label="Open YouTube settings" title="Open YouTube settings"><FontAwesomeIcon icon={faArrowUpRightFromSquare} /></button>
          </div>
        )}
        <form className="url-form" onSubmit={submit} aria-busy={working}>
          <label className="sr-only" htmlFor="media-url">Media URL</label>
          <span className="url-leading" aria-hidden="true">
            {gate === "verified" ? <Icon name="link" /> : <span className="verification-spinner" />}
          </span>
          <input
            ref={urlInputRef}
            id="media-url"
            type="url"
            value={url}
            onChange={(event) => {
              const nextUrl = event.target.value;
              setUrl(nextUrl);
              if (isMusicUrl(nextUrl)) setOpenMenu(null);
            }}
            onFocus={(event) => event.currentTarget.select()}
            placeholder={gate === "verified" ? "Paste a link" : "Waiting for verification"}
            autoComplete="url"
            inputMode="url"
            disabled={gate !== "verified" || working}
            required
          />
          <div className="download-mode-menu" data-open={openMenu === "mode"} data-side={flyoutLayout.side} ref={downloadModeMenu}>
            <button
              className="download-mode-trigger"
              type="button"
              aria-label={`Download mode: ${downloadMode === "audio" ? "Audio only" : "Media"}`}
              title={musicModeLocked ? "Audio only is required for music links" : "Choose download mode"}
              aria-haspopup="menu"
              aria-expanded={openMenu === "mode"}
              disabled={musicModeLocked}
              onClick={(event) => toggleFlyout("mode", event)}
            >
              <span>{downloadMode === "audio" ? "Audio only" : "Media"}</span>
              <Icon name="chevronDown" />
            </button>
            <div className="download-mode-options" role="menu" aria-label="Choose download mode" style={{ maxHeight: flyoutLayout.maxHeight }}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={downloadMode === "media"}
                disabled={musicModeLocked}
                onClick={() => {
                  setPreferredDownloadMode("media");
                  setOpenMenu(null);
                }}
              >
                <Icon name="video" />
                <strong>Media</strong>
                {downloadMode === "media" && <Icon name="check" />}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={downloadMode === "audio"}
                onClick={() => {
                  setPreferredDownloadMode("audio");
                  setOpenMenu(null);
                }}
              >
                <Icon name="music" />
                <strong>Audio only</strong>
                {downloadMode === "audio" && <Icon name="check" />}
              </button>
            </div>
          </div>
          <button className="submit-button" type="submit" aria-label="Process URL" title={isYouTubeUrl(url) && !dlpAvailable ? "This API instance does not support YouTube downloads" : undefined} disabled={gate !== "verified" || working || !url.trim() || (isYouTubeUrl(url) && !dlpAvailable)}>
            {working ? <span className="spinner" /> : <Icon name="arrowUp" />}
          </button>
        </form>
        <nav className="workspace-actions" aria-label="Application controls">
          <div className="preview-notice" role="status" aria-label="Preview version">
            <span className="preview-stripes" aria-hidden="true" />
            <span className="preview-label">Preview version expect bugs</span>
          </div>
          <div className="workspace-popover" data-open={openMenu === "services"} data-side={flyoutLayout.side} ref={servicesMenu}>
            <button className="workspace-popover-trigger" type="button" aria-label="Available services" aria-expanded={openMenu === "services"} onClick={(event) => toggleFlyout("services", event)}><Icon name="services" /><span>Services</span></button>
            <div className="workspace-popover-panel services-panel" style={{ maxHeight: flyoutLayout.maxHeight }}>
              <strong>Supported platforms</strong>
              <ul>{supportedPlatforms.map((platform) => <li key={platform.name}><FontAwesomeIcon icon={platform.icon} /><span>{platform.name}</span></li>)}</ul>
            </div>
          </div>
          <div>
            <button
              ref={settingsTrigger}
              className="workspace-popover-trigger settings-trigger"
              type="button"
              aria-label="Settings"
              title="Settings"
              aria-expanded={settingsOpen}
              onClick={() => openSettings()}
            >
              <Icon name="settings" />
            </button>
          </div>
        </nav>
        {gate === "error" && <button className="verification-retry" onClick={() => void checkSession()}>Retry verification</button>}

      </section>

      <div className="toaster-host">
        <Toaster
          className="pinchana-toaster"
          position="bottom-right"
          theme="dark"
          richColors
          closeButton
          expand
          duration={4_500}
          visibleToasts={4}
          offset={{ right: 24, bottom: 24 }}
          mobileOffset={{ right: 16, bottom: 82, left: 16 }}
        />
      </div>

      <footer className="app-footer">
        <span className="tg-promo">
          Using Telegram? Try Pinchana there!{" "}
          <a href="https://t.me/pinchanabot" target="_blank" rel="noopener noreferrer" className="tg-button">
            Open TG
          </a>
        </span>
        <Link href="/policy" className="footer-link-btn">
          Privacy Policy
        </Link>
        <span className="footer-separator" aria-hidden="true" />
        <Link href="/usage" className="footer-link-btn">
          Terms of Use
        </Link>
        <span className="footer-separator" aria-hidden="true" />
        <a href="https://docs.pinchana.cc" className="footer-link-btn">
          Docs
        </a>
        <span className="footer-separator" aria-hidden="true" />
        <a href="https://github.com/Pinchana/pinchana-web" target="_blank" rel="noopener noreferrer" className="github-link">
          <FontAwesomeIcon className="github-icon" icon={faGithub} />
          GitHub
        </a>
        <style>{`
          .app-shell {
            position: relative;
          }
          .app-footer {
            position: absolute;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 18px;
            color: var(--muted);
            font-size: 13px;
            z-index: 10;
            white-space: nowrap;
          }
          .app-footer a {
            color: var(--muted);
            text-decoration: none;
            transition: color .18s ease;
          }
          .app-footer a:hover {
            color: var(--text);
          }
          .footer-link-btn {
            background: none;
            border: none;
            padding: 0;
            color: var(--muted);
            font-size: 13px;
            cursor: pointer;
            text-decoration: none;
            font-family: inherit;
            transition: color .18s ease;
          }
          .footer-link-btn:hover {
            color: var(--text);
          }
          .tg-button {
            display: inline-flex;
            align-items: center;
            margin-left: 8px;
            padding: 4px 11px;
            border: 1px solid var(--line-strong);
            border-radius: 999px;
            background: var(--panel-raised);
            font-size: 11px;
            font-weight: 700;
            transition: border-color .18s ease, background .18s ease, color .18s ease !important;
          }
          .tg-button:hover {
            border-color: var(--text);
            background: var(--text);
            color: var(--black) !important;
          }
          .footer-separator {
            width: 1px;
            height: 14px;
            background: var(--line);
          }
          .github-link {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .github-icon {
            width: 15px;
            height: 15px;
          }
          @media (max-width: 600px) {
            .app-footer {
              position: relative;
              bottom: auto;
              left: auto;
              transform: none;
              flex-direction: column;
              gap: 14px;
              margin-top: 36px;
              margin-bottom: 12px;
              text-align: center;
            }
            .footer-separator {
              display: none;
            }
          }
        `}</style>
      </footer>

      <CookieConsent />
      </div>

      <SettingsView
        ref={cookieVaultRef}
        open={settingsOpen}
        activeSection={settingsSection}
        mobileIndex={settingsMobileIndex}
        onSectionChange={setSettingsSection}
        onMobileIndexChange={setSettingsMobileIndex}
        onClose={closeSettings}
        autoSave={autoSave}
        onAutoSave={setAutoSave}
        zipMultiple={zipMultiple}
        onZipMultiple={setZipMultiple}
        pawsEnabled={pawsEnabled}
        onPawsEnabled={setPawsEnabled}
        reduceMotion={reduceMotion}
        onReduceMotion={setReduceMotion}
        dlpAvailable={dlpAvailable}
        dlpQuality={dlpQuality}
        onDlpQuality={setDlpQuality}
        dlpQualities={dlpQualities}
        dlpCodec={dlpCodec}
        onDlpCodec={setDlpCodec}
        dlpCodecs={dlpCodecs}
        onDlpContainer={setDlpContainer}
        dlpContainer={dlpContainer}
        dlpContainers={dlpContainers}
        dlpAudioFormat={dlpAudioFormat}
        onDlpAudioFormat={setDlpAudioFormat}
        dlpAudioFormats={dlpAudioFormats}
        dlpAudioBitrate={dlpAudioBitrate}
        onDlpAudioBitrate={setDlpAudioBitrate}
        dlpAudioBitrates={dlpAudioBitrates}
        preferBetterAudio={preferBetterAudio}
        onPreferBetterAudio={setPreferBetterAudio}
        betterAudioAvailable={betterAudioAvailable}
        dubLanguage={dubLanguage}
        onDubLanguage={setDubLanguage}
        dubLanguages={dubLanguages}
        apiOrigin={apiOrigin}
        onApiOrigin={setApiOrigin}
        apiCustom={apiCustom}
        apiStatus={apiStatus}
        apiSaving={apiSaving}
        onConnectApi={saveApiOrigin}
        onUseDefaultApi={useDefaultApiOrigin}
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        onProfiles={(profiles, unlocked) => { setVaultProfiles(profiles); setVaultUnlocked(unlocked); if (!unlocked) setSelectedProfileId(""); }}
      />
    </main>
  );
}
