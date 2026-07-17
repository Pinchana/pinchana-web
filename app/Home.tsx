"use client";

/* Authenticated media cannot use the Next image optimizer because its server-side
   fetch does not carry the visitor's HttpOnly Pinchana session cookie. */
/* eslint-disable @next/next/no-img-element */

import Script from "next/script";
import Link from "next/link";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowUp, faCheck, faChevronDown, faDownload, faGear, faGlobe, faLink, faLock, faMusic, faVideo } from "@fortawesome/free-solid-svg-icons";
import { faDeezer, faGithub, faInstagram, faSoundcloud, faSpotify, faThreads, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Toaster, toast } from "sonner";
import {useLocale, useTranslations} from "next-intl";
import CookieConsent from "./components/CookieConsent";
import LanguagePicker from "./components/LanguagePicker";
import type { CookieVaultHandle, VaultProfileSummary } from "./components/CookieVault";
import { AudioPlayer, CompactAudioPlayer, VideoPlayer } from "./components/MediaPlayers";
import { vaultExists } from "@/lib/cookie-vault";
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
import {
  FILENAME_STYLES,
  FilenameStyle,
} from "./lib/filename";
import { dlpDownloadPath, formatDownloadSize, isLargeDownload } from "./lib/dlp-download";
import {
  DownloadAsset,
  ScrapeResult,
  archiveFilenameFor,
  assetsFor,
  coverUrlFor,
  parseScrapeResponse,
  previewAssetsFor,
  resultAuthor,
  resultTitle,
  soundtrackFor,
} from "./lib/scrape-result";
import {
  BuildManifest,
  DeviceSnapshot,
  collectDeviceSnapshot,
  sanitizeBuildManifest,
} from "./lib/diagnostics";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

type DownloadMode = "media" | "audio";
type GateState = "checking" | "challenge" | "verifying" | "verified" | "error";
type NotificationType = "error" | "info" | "success";
type TurnstilePhase = "background" | "interactive";
type DlpJobState = {
  phase: "processing" | "ready";
  sourceUrl: string;
  requestKey: string;
  jobId: string;
  expiresAt: number;
  message: string;
  progress: number | null;
  size: number | null;
  downloadStarted: boolean;
};

const WEB_VERSION = "preview";
const RAW_WEB_COMMIT = process.env.NEXT_PUBLIC_PINCHANA_WEB_COMMIT || "development";
const WEB_COMMIT = /^[0-9a-f]{7,40}$/i.test(RAW_WEB_COMMIT) ? RAW_WEB_COMMIT.toLowerCase() : "development";
const EMPTY_BUILD_MANIFEST: BuildManifest = { version: "preview", commits: {} };

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
const supportedPlatformIcons = new Map(supportedPlatforms.map((platform) => [platform.name, platform.icon]));

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

function preloadPreviewAsset(asset: DownloadAsset | undefined): Promise<void> {
  if (!asset || asset.kind === "audio") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    timeoutId = window.setTimeout(finish, 5_000);

    if (asset.kind === "image") {
      const image = new Image();
      image.onload = () => void image.decode().catch(() => undefined).finally(finish);
      image.onerror = finish;
      image.src = asset.url;
      return;
    }

    const video = document.createElement("video");
    const cleanup = () => {
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
    };
    const ready = () => {
      cleanup();
      finish();
    };
    const failed = () => {
      cleanup();
      finish();
    };
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.src = asset.url;
    video.load();
  });
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
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
  copy: {
    fetching: (current: number, total: number) => string;
    fetchFailed: (name: string) => string;
  },
): Promise<{ input: Blob; name: string }[]> {
  const audioItems = items.filter((item) => item.kind === "audio");
  const candidates = audioItems.length ? audioItems : items.filter((item) => item.kind === "video");
  if (!candidates.length) throw new NoAudioAvailableError();

  const prepared: { input: Blob; name: string }[] = [];
  for (const [index, item] of candidates.entries()) {
    onStatus(copy.fetching(index + 1, candidates.length));
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(copy.fetchFailed(item.name));
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

function Icon({ name }: { name: "settings" | "services" | "arrow" | "download" | "link" | "arrowUp" | "music" | "video" | "check" | "chevronDown" }) {
  const icons: Record<typeof name, IconDefinition> = {
    settings: faGear,
    services: faGlobe,
    arrow: faArrowRight,
    download: faDownload,
    link: faLink,
    arrowUp: faArrowUp,
    music: faMusic,
    video: faVideo,
    check: faCheck,
    chevronDown: faChevronDown,
  };
  return <FontAwesomeIcon icon={icons[name]} />;
}

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale();
  const dlpStageMessage = useCallback((stage: string): string => {
    switch (stage.toLowerCase()) {
      case "starting": return t("stageStarting");
      case "decrypting": return t("stageDecrypting");
      case "downloading": return t("stageDownloading");
      case "merging": return t("stageMerging");
      case "finalizing": return t("stageFinalizing");
      case "queued": return t("stageQueued");
      default: return t("stageDefault");
    }
  }, [t]);
  const turnstileErrorMessage = useCallback((code: string): string => {
    if (code.startsWith("300") || code.startsWith("600")) return t("browserCheckFailed");
    if (code === "200500") return t("checkCouldNotLoad");
    if (code === "110200") return t("hostnameUnauthorized");
    if (code === "110600" || code === "110620") return t("checkTimedOut");
    if (code.startsWith("110") || code.startsWith("400")) return t("checkMisconfigured");
    return t("checkFailed");
  }, [t]);
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState(t("sessionChecking"));
  const [turnstileInteractive, setTurnstileInteractive] = useState(false);
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [working, setWorking] = useState(false);
  const [workingKind, setWorkingKind] = useState<"scrape" | "dlp" | null>(null);
  const [mediaMorphing, setMediaMorphing] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [downloadState, setDownloadState] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [dlpJob, setDlpJob] = useState<DlpJobState | null>(null);
  const [preferredDownloadMode, setPreferredDownloadMode] = useState<DownloadMode>("media");
  const [openMenu, setOpenMenu] = useState<"mode" | "services" | "youtube-options" | null>(null);
  const [flyoutLayout, setFlyoutLayout] = useState<{ side: "above" | "below"; maxHeight: number }>({ side: "below", maxHeight: 440 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [settingsMobileIndex, setSettingsMobileIndex] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideshowVolume, setSlideshowVolume] = useState(0.75);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [preparedAudio, setPreparedAudio] = useState<PreparedAudio[]>([]);
  const [preparedAudioKey, setPreparedAudioKey] = useState("");
  const [audioPreparing, setAudioPreparing] = useState(false);
  const [mediaFallback, setMediaFallback] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [zipMultiple, setZipMultiple] = useState(true);
  const [filenameStyle, setFilenameStyle] = useState<FilenameStyle>("pretty");
  const [pawsEnabled, setPawsEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [convertTwitterGifs, setConvertTwitterGifs] = useState(true);
  const [instanceReady, setInstanceReady] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "");
  const [apiOrigin, setApiOrigin] = useState("");
  const [apiCustom, setApiCustom] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [apiSaving, setApiSaving] = useState(false);
  const [apiBuild, setApiBuild] = useState<BuildManifest>(EMPTY_BUILD_MANIFEST);
  const [deviceSnapshot, setDeviceSnapshot] = useState<DeviceSnapshot | null>(null);
  const [dlpAvailable, setDlpAvailable] = useState(false);
  const [dlpQuality, setDlpQuality] = useState<DlpQuality>("1080p");
  const [dlpCodec, setDlpCodec] = useState<DlpCodec>("h264");
  const [dlpContainer, setDlpContainer] = useState<DlpContainer>("mp4");
  const [dlpAudioFormat, setDlpAudioFormat] = useState<DlpAudioFormat>("mp3");
  const [dlpAudioBitrate, setDlpAudioBitrate] = useState<DlpAudioBitrate>("128");
  const [preferBetterAudio, setPreferBetterAudio] = useState(false);
  const [dubLanguage, setDubLanguage] = useState("original");
  const [subtitleLanguage, setSubtitleLanguage] = useState("none");
  const [dlpQualities, setDlpQualities] = useState<DlpQuality[]>([]);
  const [dlpCodecs, setDlpCodecs] = useState<DlpCodec[]>([]);
  const [dlpContainers, setDlpContainers] = useState<DlpContainer[]>([]);
  const [dlpAudioFormats, setDlpAudioFormats] = useState<DlpAudioFormat[]>([]);
  const [dlpAudioBitrates, setDlpAudioBitrates] = useState<DlpAudioBitrate[]>([]);
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
  const [dlpFilenameStyles, setDlpFilenameStyles] = useState<FilenameStyle[]>([]);
  const [subtitleLanguages, setSubtitleLanguages] = useState<string[]>([]);
  const [betterAudioAvailable, setBetterAudioAvailable] = useState(false);
  const [activeServices, setActiveServices] = useState<string[]>([]);
  const [vaultProfiles, setVaultProfiles] = useState<VaultProfileSummary[]>([]);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultExistsState, setVaultExistsState] = useState(false);
  const [accentCookies, setAccentCookies] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const turnstileHost = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const turnstileInteractiveRef = useRef(false);
  const turnstileErrorCodeRef = useRef<string | null>(null);
  const reportedTurnstileErrors = useRef(new Set<string>());
  const autoSaved = useRef<string | null>(null);
  const preparedAudioUrls = useRef<string[]>([]);
  const downloadModeMenu = useRef<HTMLDivElement>(null);
  const servicesMenu = useRef<HTMLDivElement>(null);
  const youtubeMenu = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const settingsReturnTitle = useRef("Pinchana");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const cookieVaultRef = useRef<CookieVaultHandle>(null);
  const activeLayoutTransition = useRef<ViewTransition | null>(null);
  const submitInFlight = useRef(false);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    document.title = settingsReturnTitle.current;
    requestAnimationFrame(() => settingsReturnFocus.current?.focus());
  }, []);

  const notify = useCallback((type: NotificationType, message: string) => {
    toast[type](message, { duration: 4_500 });
  }, []);

  const cancelLayoutTransition = useCallback(() => {
    activeLayoutTransition.current?.skipTransition();
    activeLayoutTransition.current = null;
  }, []);

  const trackLayoutTransition = useCallback((transition: ViewTransition) => {
    activeLayoutTransition.current = transition;
    void transition.finished.then(
      () => { if (activeLayoutTransition.current === transition) activeLayoutTransition.current = null; },
      () => { if (activeLayoutTransition.current === transition) activeLayoutTransition.current = null; },
    );
  }, []);

  const clearMediaPreview = useCallback(() => {
    for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
    preparedAudioUrls.current = [];
    setActivePlayerId(null);
    setAudioPreparing(false);
    setPreparedAudio([]);
    setPreparedAudioKey("");
    setMediaFallback(false);
    setActiveSlide(0);
    setDownloadState("");
    setResult(null);
    setResolvedUrl("");
  }, []);

  const invalidateReadyDlp = useCallback(() => {
    setDlpJob((current) => current?.phase === "ready" ? null : current);
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

  const normalizedUrl = url.trim();
  const assets = useMemo(() => result ? assetsFor(result, filenameStyle) : [], [filenameStyle, result]);
  const archiveFilename = useMemo(() => result ? archiveFilenameFor(result, filenameStyle) : "media [pinchana.cc].zip", [filenameStyle, result]);
  const resultKey = useMemo(() => result ? JSON.stringify(result) : "", [result]);
  const musicModeLocked = useMemo(() => isMusicUrl(url), [url]);
  const downloadMode: DownloadMode = musicModeLocked ? "audio" : preferredDownloadMode;
  const resultMatchesUrl = Boolean(result && resolvedUrl === normalizedUrl);
  const dlpRequestKey = useMemo(() => JSON.stringify({
    mode: downloadMode,
    quality: dlpQuality,
    codec: dlpCodec,
    container: dlpContainer,
    audioFormat: dlpAudioFormat,
    audioBitrate: dlpAudioBitrate,
    preferBetterAudio,
    dubLanguage,
    filenameStyle,
    subtitleLanguage,
    profile: selectedProfileId,
  }), [dlpAudioBitrate, dlpAudioFormat, dlpCodec, dlpContainer, dlpQuality, downloadMode, dubLanguage, filenameStyle, preferBetterAudio, selectedProfileId, subtitleLanguage]);
  const dlpBusy = (working && workingKind === "dlp") || dlpJob?.phase === "processing";
  const dlpReadyMatches = Boolean(
    dlpJob?.phase === "ready"
      && dlpJob.sourceUrl === normalizedUrl
      && dlpJob.requestKey === dlpRequestKey,
  );
  const dlpSizeLabel = formatDownloadSize(dlpJob?.size ?? null, locale);
  const dlpIsLarge = isLargeDownload(dlpJob?.size ?? null);
  const activity = dlpJob?.phase === "processing"
    ? t("activityYoutube", {state: dlpJob.message})
    : dlpJob?.phase === "ready"
      ? t("activityYoutube", {state: dlpJob.downloadStarted ? t("activityHanded") : t("activityReady")})
      : audioPreparing
        ? t("activityMedia", {state: t("activityPreparingAudio")})
        : downloadBusy
          ? t("activityMedia", {state: t("activitySaving")})
          : workingKind === "scrape" || mediaMorphing
            ? t("activityLink", {state: t("activityLoading")})
            : workingKind === "dlp"
              ? t("activityYoutube", {state: t("activityStarting")})
              : result
                ? t("activityPreview", {state: t("activityReady")})
                : t("activityIdle");
  const copyDiagnostics = useCallback(async () => {
    const deviceLines = deviceSnapshot ? [
      t("debug.browser", {value: deviceSnapshot.browser}),
      t("debug.platform", {value: deviceSnapshot.platform}),
      t("debug.viewport", {value: deviceSnapshot.viewport}),
      t("debug.input", {value: deviceSnapshot.input}),
      t("debug.motion", {value: deviceSnapshot.motion}),
      t("debug.connection", {value: deviceSnapshot.connection}),
    ] : [];
    const apiCommitLines = Object.entries(apiBuild.commits)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, entry]) => `API ${name}: ${entry.commit}`);
    const text = [
      `Pinchana Web: ${WEB_VERSION} (${WEB_COMMIT})`,
      t("debug.activity", {value: activity}),
      t("debug.session", {value: gate}),
      t("debug.instance", {value: apiCustom ? t("debug.custom") : t("debug.default")}),
      t("debug.dlp", {value: dlpAvailable ? t("debug.available") : t("debug.unavailable")}),
      t("debug.services", {count: activeServices.length}),
      ...deviceLines,
      ...apiCommitLines,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify("success", t("debugCopied"));
    } catch {
      notify("error", t("debugCopyFailed"));
    }
  }, [activeServices.length, activity, apiBuild.commits, apiCustom, deviceSnapshot, dlpAvailable, gate, notify, t]);

  const displayTitle = useMemo(() => {
    if (!result) return t("untitled");
    const text = resultTitle(result);
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }, [result, t]);
  const displayAuthor = useMemo(() => result ? resultAuthor(result) : "", [result]);
  const coverUrl = useMemo(() => result ? coverUrlFor(result) : undefined, [result]);

  useEffect(() => {
    void vaultExists().then(setVaultExistsState).catch(() => {});
  }, [vaultUnlocked]);

  useEffect(() => {
    if (dlpJob?.phase !== "ready" || !dlpJob.expiresAt) return;
    const remaining = dlpJob.expiresAt * 1000 - Date.now();
    if (remaining <= 0) {
      queueMicrotask(() => setDlpJob((current) => current?.jobId === dlpJob.jobId ? null : current));
      return;
    }
    const timeout = window.setTimeout(() => {
      setDlpJob((current) => current?.jobId === dlpJob.jobId ? null : current);
    }, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [dlpJob]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pinchana-settings") || "{}");
      queueMicrotask(() => {
        if (typeof saved.autoSave === "boolean") setAutoSave(saved.autoSave);
        if (typeof saved.zipMultiple === "boolean") setZipMultiple(saved.zipMultiple);
        if (FILENAME_STYLES.some((option) => option.value === saved.filenameStyle)) setFilenameStyle(saved.filenameStyle);
        if (typeof saved.pawsEnabled === "boolean") setPawsEnabled(saved.pawsEnabled);
        if (typeof saved.reduceMotion === "boolean") setReduceMotion(saved.reduceMotion);
        if (typeof saved.convertTwitterGifs === "boolean") setConvertTwitterGifs(saved.convertTwitterGifs);
        if (saved.downloadMode === "media" || saved.downloadMode === "audio") setPreferredDownloadMode(saved.downloadMode);
        if (DLP_VIDEO_QUALITIES.some((option) => option.value === saved.dlpQuality)) setDlpQuality(saved.dlpQuality);
        if (DLP_CODECS.some((option) => option.value === saved.dlpCodec)) setDlpCodec(saved.dlpCodec);
        if (DLP_CONTAINERS.some((option) => option.value === saved.dlpContainer)) setDlpContainer(saved.dlpContainer);
        if (DLP_AUDIO_FORMATS.some((option) => option.value === saved.dlpAudioFormat)) setDlpAudioFormat(saved.dlpAudioFormat);
        if (DLP_AUDIO_BITRATES.some((option) => option.value === saved.dlpAudioBitrate)) setDlpAudioBitrate(saved.dlpAudioBitrate);
        if (typeof saved.preferBetterAudio === "boolean") setPreferBetterAudio(saved.preferBetterAudio);
        if (typeof saved.dubLanguage === "string") setDubLanguage(saved.dubLanguage);
        if (typeof saved.subtitleLanguage === "string") setSubtitleLanguage(saved.subtitleLanguage);
      });
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave, zipMultiple, filenameStyle, pawsEnabled, reduceMotion, convertTwitterGifs, downloadMode: preferredDownloadMode, dlpQuality, dlpCodec, dlpContainer, dlpAudioFormat, dlpAudioBitrate, preferBetterAudio, dubLanguage, subtitleLanguage }));
  }, [autoSave, convertTwitterGifs, dlpAudioBitrate, dlpAudioFormat, dlpCodec, dlpContainer, dlpQuality, dubLanguage, filenameStyle, preferBetterAudio, zipMultiple, pawsEnabled, preferredDownloadMode, reduceMotion, subtitleLanguage]);

  useEffect(() => {
    document.documentElement.classList.toggle("paws-disabled", !pawsEnabled);
    document.documentElement.classList.toggle("motion-disabled", reduceMotion);
  }, [pawsEnabled, reduceMotion]);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "about") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setDeviceSnapshot(collectDeviceSnapshot());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    motion.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      motion.removeEventListener("change", update);
    };
  }, [settingsOpen, settingsSection]);

  useEffect(() => () => {
    for (const previewUrl of preparedAudioUrls.current) URL.revokeObjectURL(previewUrl);
  }, []);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      for (const menu of [downloadModeMenu, servicesMenu, youtubeMenu]) {
        if (menu.current?.contains(target)) return;
      }
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  useEffect(() => {
    const pasteIntoUrlBar = (event: ClipboardEvent) => {
      if (settingsOpen || working || mediaMorphing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea"))) return;
      const pasted = event.clipboardData?.getData("text/plain").trim();
      if (!pasted) return;
      event.preventDefault();
      cancelLayoutTransition();
      clearMediaPreview();
      setDlpJob(null);
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
  }, [cancelLayoutTransition, clearMediaPreview, mediaMorphing, settingsOpen, working]);

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
      if (working || mediaMorphing) return;
      if (!result) return;
      event.preventDefault();
      cancelLayoutTransition();
      if (!reduceMotion && document.startViewTransition) {
        const transition = document.startViewTransition(() => flushSync(clearMediaPreview));
        trackLayoutTransition(transition);
      } else {
        clearMediaPreview();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [cancelLayoutTransition, clearMediaPreview, closeSettings, mediaMorphing, openMenu, reduceMotion, result, settingsOpen, trackLayoutTransition, working]);

  const checkSession = useCallback(async () => {
    turnstileInteractiveRef.current = false;
    turnstileErrorCodeRef.current = null;
    setTurnstileInteractive(false);
    setTurnstileErrorCode(null);
    setGate("checking");
    setGateMessage(t("checkingVerification"));
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.valid) {
        setExpiresAt(typeof payload.expires_at === "number" ? payload.expires_at : null);
        setGate("verified");
        setGateMessage(t("verified"));
      } else if (response.status === 401) {
        setGate("challenge");
        setGateMessage(t("completeCheck"));
      } else {
        throw new Error();
      }
    } catch {
      setGate("error");
      setGateMessage(t("verificationUnavailable"));
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/instance", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || t("instanceUnavailable"));
        if (!active) return;
        setApiCustom(payload.custom === true);
        setApiOrigin(payload.custom && typeof payload.origin === "string" ? payload.origin : "");
        setApiStatus("");
        if (typeof payload.turnstile_site_key === "string") setTurnstileSiteKey(payload.turnstile_site_key);
      } catch (reason) {
        if (active) setApiStatus(reason instanceof Error ? reason.message : t("instanceUnavailable"));
      } finally {
        if (active) setInstanceReady(true);
      }
    })();
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (instanceReady) queueMicrotask(() => void checkSession());
  }, [checkSession, instanceReady]);

  useEffect(() => {
    if (!instanceReady) return;
    let active = true;
    void fetch("/api/build", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (active) setApiBuild(sanitizeBuildManifest(payload)); })
      .catch(() => { if (active) setApiBuild(EMPTY_BUILD_MANIFEST); });
    return () => { active = false; };
  }, [apiStatus, instanceReady]);

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
        setDlpFilenameStyles(Array.isArray(capability?.filenameStyles) ? capability.filenameStyles.filter((value: unknown): value is FilenameStyle => typeof value === "string" && FILENAME_STYLES.some((option) => option.value === value)) : []);
        setSubtitleLanguages(Array.isArray(capability?.subtitleLanguages) ? capability.subtitleLanguages.filter((value: unknown): value is string => typeof value === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) : []);
        setBetterAudioAvailable(capability?.betterAudio === true);

        const serviceDisplayNames: Record<string, string> = {
          tiktok: "TikTok",
          instagram: "Instagram",
          shorts: "YouTube Shorts",
          soundcloud: "SoundCloud",
          ytmusic: "YouTube Music",
          spotify: "Spotify",
          deezer: "Deezer",
          threads: "Threads",
          twitter: "Twitter / X",
        };
        const rawServices = payload?.services;
        if (Array.isArray(rawServices)) {
          const mapped = rawServices.map((s: string) => serviceDisplayNames[s] || s.charAt(0).toUpperCase() + s.slice(1));
          setActiveServices(mapped);
        } else {
          setActiveServices([]);
        }
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
        setDlpFilenameStyles([]);
        setSubtitleLanguages([]);
        setBetterAudioAvailable(false);
        setActiveServices([]);
      });
    return () => { active = false; };
  }, [gate, apiStatus]);

  useEffect(() => {
    if (!expiresAt || gate !== "verified") return;
    const delay = Math.max(0, expiresAt * 1000 - Date.now());
    const timeout = window.setTimeout(() => {
      setGate("challenge");
      setGateMessage(t("sessionExpired"));
      setResult(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAt, gate, t]);

  useEffect(() => {
    const host = turnstileHost.current;
    const sitekey = turnstileSiteKey;
    if (gate !== "challenge" || !scriptReady || !host || !window.turnstile || widgetId.current) return;
    if (!sitekey) {
      queueMicrotask(() => {
        setGate("error");
        setGateMessage(t("siteKeyMissing"));
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
        setGateMessage(t("completeCheck"));
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
        setGateMessage(t("verifying"));
        try {
          const response = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || t("verificationFailed"));
          setExpiresAt(typeof payload.expiresAt === "number" ? payload.expiresAt : null);
          setGate("verified");
          setGateMessage(t("verified"));
        } catch (reason) {
          setGate("challenge");
          setGateMessage(reason instanceof Error ? reason.message : t("verificationFailed"));
          if (widgetId.current) window.turnstile?.reset(widgetId.current);
        }
      },
      "expired-callback": () => {
        setInteractionVisible(false);
        turnstileErrorCodeRef.current = null;
        setTurnstileErrorCode(null);
        setGate("challenge");
        setGateMessage(t("checkExpired"));
      },
      "timeout-callback": () => {
        reportTurnstileError("110620", "interactive");
        turnstileErrorCodeRef.current = "110620";
        setTurnstileErrorCode("110620");
        setGate("challenge");
        setGateMessage(t("checkTimedOut"));
        setInteractionVisible(true);
      },
      "unsupported-callback": () => {
        turnstileErrorCodeRef.current = "unsupported";
        setTurnstileErrorCode("unsupported");
        setGate("challenge");
        setGateMessage(t("browserUnsupported"));
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
  }, [gate, reportTurnstileError, scriptReady, t, turnstileErrorMessage, turnstileSiteKey]);

  const retryTurnstile = useCallback(() => {
    turnstileErrorCodeRef.current = null;
    setTurnstileErrorCode(null);
    turnstileInteractiveRef.current = false;
    setTurnstileInteractive(false);
    setGateMessage(t("retryingCheck"));
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      return;
    }
    void checkSession();
  }, [checkSession, t]);

  async function applyApiOrigin(nextOrigin: string) {
    if (apiSaving) return;
    setApiSaving(true);
    setApiStatus(nextOrigin.trim() ? t("verifyingInstance") : t("restoringApi"));
    try {
      let response: Response;
      if (!nextOrigin.trim()) {
        response = await fetch("/api/instance", { method: "DELETE" });
      } else {
        const parsed = new URL(nextOrigin.trim());
        const origin = parsed.origin;
        if (parsed.toString() !== `${origin}/` && parsed.toString() !== origin) {
          throw new Error(t("originOnly"));
        }
        const identityResponse = await fetch(`${origin}/web/identity`, { cache: "no-store", mode: "cors" });
        const certificate = await identityResponse.json().catch(() => null);
        if (!identityResponse.ok) throw new Error(t("certificateMissing"));
        response = await fetch("/api/instance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, certificate }),
        });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t("instanceFailed"));
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      setTurnstileSiteKey(typeof payload.turnstile_site_key === "string" ? payload.turnstile_site_key : "");
      setApiCustom(payload.custom === true);
      setApiOrigin(payload.custom && typeof payload.origin === "string" ? payload.origin : "");
      setApiStatus(payload.custom ? t("customConnected") : t("defaultRestored"));
      setExpiresAt(null);
      setResult(null);
      setDlpJob(null);
      setGate("checking");
      setGateMessage(t("checkingVerification"));
      await checkSession();
    } catch (reason) {
      setApiStatus(reason instanceof Error ? reason.message : t("instanceFailed"));
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
      setDownloadState(t("preparingAudioEllipsis"));
    });

    void prepareAudioFiles(assets, (message) => {
      if (!cancelled) setDownloadState(message);
    }, {
      fetching: (current, total) => t("fetchingAudio", {current, total}),
      fetchFailed: (name) => t("fetchFailed", {name}),
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
          notify("error", t("noMusicAudio"));
          return;
        }
        autoSaved.current = `${resultKey}:media`;
        setMediaFallback(true);
        setPreferredDownloadMode("media");
        setDownloadState("");
        notify("info", t("switchedToMedia"));
        return;
      }
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error("pinchana_audio_preparation_failed", reason);
      setDownloadState("");
      notify("error", t("audioConversionFailed", {message}));
    }).finally(() => {
      if (!cancelled) setAudioPreparing(false);
    });

    return () => { cancelled = true; };
  }, [assets, downloadMode, musicModeLocked, notify, preparedAudioKey, result, resultKey, t]);

  const downloadAssets = useCallback(async (
    items: DownloadAsset[],
    archiveName: string,
    mode: DownloadMode,
    currentResultKey = "",
  ) => {
    if (!items.length || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadState(mode === "audio" ? t("preparingAudioEllipsis") : t("preparingDownload"));
    try {
      if (mode === "audio") {
        if (preparedAudioKey !== currentResultKey || !preparedAudio.length) {
          throw new Error(audioPreparing ? t("audioStillPreparing") : t("audioPreparationIncomplete"));
        }
        const prepared = preparedAudio;
        if (prepared.length > 1 && zipMultiple) {
          const { downloadZip } = await import("client-zip");
          const blob = await downloadZip(prepared).blob();
          triggerSave(blob, archiveName);
        } else {
          for (const item of prepared) triggerSave(item.input, item.name);
        }
      } else if (convertTwitterGifs && items.some((item) => item.kind === "video" && item.looping)) {
        setDownloadState(t("loadingGifConverter"));
        const converter = await import("./lib/audio-converter");
        const loopingTotal = items.filter((item) => item.kind === "video" && item.looping).length;
        let loopingCurrent = 0;
        const prepared: { input: Blob; name: string }[] = [];
        for (const item of items) {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(t("fetchFailed", {name: item.name}));
          const source = await response.blob();
          if (item.kind === "video" && item.looping) {
            loopingCurrent += 1;
            const sourceExtension = item.name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || "mp4";
            setDownloadState(t("convertingGif", {current: loopingCurrent, total: loopingTotal, progress: 0}));
            prepared.push({
              input: await converter.convertToGif(source, sourceExtension, (progress) => {
                setDownloadState(t("convertingGif", {current: loopingCurrent, total: loopingTotal, progress}));
              }),
              name: `${item.name.replace(/\.[^.]+$/, "")}.gif`,
            });
          } else {
            prepared.push({ input: source, name: item.name });
          }
        }
        if (prepared.length > 1 && zipMultiple) {
          const { downloadZip } = await import("client-zip");
          triggerSave(await downloadZip(prepared).blob(), archiveName);
        } else {
          for (const item of prepared) triggerSave(item.input, item.name);
        }
      } else if (items.length > 1 && zipMultiple) {
        const { downloadZip } = await import("client-zip");
        const inputs = await Promise.all(items.map(async (item) => {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(t("fetchFailed", {name: item.name}));
          return { input: response, name: item.name };
        }));
        const blob = await downloadZip(inputs).blob();
        triggerSave(blob, archiveName);
      } else {
        for (const item of items) {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(t("fetchFailed", {name: item.name}));
          triggerSave(await response.blob(), item.name);
        }
      }
      setDownloadState("");
      notify("success", t("downloadSaved"));
    } catch (reason) {
      if (reason instanceof NoAudioAvailableError) {
        if (musicModeLocked) {
          setDownloadState("");
          notify("error", t("noMusicAudio"));
          return;
        }
        if (currentResultKey) autoSaved.current = `${currentResultKey}:media`;
        setPreferredDownloadMode("media");
        setDownloadState("");
        notify("info", t("switchedToMedia"));
      } else {
        const message = reason instanceof Error ? reason.message : t("downloadFailed");
        console.error("pinchana_download_failed", reason);
        setDownloadState("");
        notify("error", t("downloadFailedWithReason", {message}));
      }
    } finally {
      setDownloadBusy(false);
    }
  }, [audioPreparing, convertTwitterGifs, downloadBusy, musicModeLocked, notify, preparedAudio, preparedAudioKey, t, zipMultiple]);

  useEffect(() => {
    if (!result || !autoSave || !assets.length) return;
    if (downloadMode === "audio" && (audioPreparing || preparedAudioKey !== resultKey || !preparedAudio.length)) return;
    const key = `${resultKey}:${downloadMode}`;
    if (autoSaved.current === key) return;
    autoSaved.current = key;
    void downloadAssets(assets, archiveFilename, downloadMode, resultKey);
  }, [archiveFilename, assets, audioPreparing, autoSave, downloadAssets, downloadMode, preparedAudio.length, preparedAudioKey, result, resultKey]);

  async function responsePayload(response: Response): Promise<Record<string, unknown>> {
    try { return await response.json() as Record<string, unknown>; } catch { return {}; }
  }

  async function runDlpJob(targetUrl: string, requestKey: string): Promise<DlpJobState> {
    if (!dlpAvailable) throw new Error(t("youtubeUnavailable"));
    setDlpJob((current) => current ? { ...current, message: t("startingWorker"), progress: null } : current);
    const allocationResponse = await fetch("/api/dlp/jobs", { method: "POST" });
    const allocationPayload = await responsePayload(allocationResponse);
    if (!allocationResponse.ok) throw new Error(String(allocationPayload.error || t("workerAllocationFailed")));
    const allocation = allocationPayload as unknown as DlpAllocation;
    if (!allocation.jobId || !allocation.keyId || !allocation.workerPubKey) throw new Error(t("workerAllocationInvalid"));
    let jobExpiresAt = allocation.expiresAt;
    setDlpJob((current) => current ? { ...current, jobId: allocation.jobId, expiresAt: jobExpiresAt } : current);

    let cookiesEnc;
    if (selectedProfileId) {
      setDlpJob((current) => current ? { ...current, message: t("protectingAccess"), progress: null } : current);
      const plaintext = cookieVaultRef.current?.selectedCookiesForUrl(selectedProfileId, targetUrl);
      if (!plaintext) throw new Error(t("selectCookieProfile"));
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
    const outputOptions = {
      ...(dlpFilenameStyles.includes(filenameStyle) ? { filenameStyle } : {}),
      ...(subtitleLanguages.length ? { subtitleLanguage: subtitleLanguages.includes(subtitleLanguage) ? subtitleLanguage : "none" } : {}),
    };
    setDlpJob((current) => current ? { ...current, message: t("sendingJob"), progress: null } : current);
    const submitResponse = await fetch(`/api/dlp/jobs/${allocation.jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, quality, ...formatOptions, ...audioOptions, ...youtubeAudioOptions, ...outputOptions, ...(cookiesEnc ? { cookiesEnc } : {}) }),
    });
    const submitPayload = await responsePayload(submitResponse);
    if (!submitResponse.ok) throw new Error(String(submitPayload.error || t("jobSubmissionFailed")));

    while (true) {
      if (Date.now() >= jobExpiresAt * 1000) throw new Error(t("youtubeExpired"));
      await new Promise((resolve) => window.setTimeout(resolve, 1_250));
      const statusResponse = await fetch(`/api/dlp/jobs/${allocation.jobId}`, { cache: "no-store" });
      const status = await responsePayload(statusResponse);
      if (!statusResponse.ok) throw new Error(String(status.error || t("statusFailed")));
      if (status.status === "FAILED" || status.status === "EXPIRED") throw new Error(String(status.error || t("privateDownloadFailed")));
      if (typeof status.expiresAt === "number") jobExpiresAt = status.expiresAt;
      if (status.status === "READY") {
        const size = typeof status.size === "number" && Number.isFinite(status.size) && status.size > 0
          ? status.size
          : null;
        return {
          phase: "ready",
          sourceUrl: targetUrl,
          requestKey,
          jobId: allocation.jobId,
          expiresAt: jobExpiresAt,
          message: t("readyDownload"),
          progress: 100,
          size,
          downloadStarted: false,
        };
      }
      const stage = String(status.stage || status.status || "queued");
      const progress = typeof status.progress === "number"
        ? Math.max(0, Math.min(100, status.progress))
        : null;
      setDlpJob((current) => current ? {
        ...current,
        expiresAt: jobExpiresAt,
        message: dlpStageMessage(stage),
        progress,
      } : current);
    }
  }

  function startDlpDownload(job: DlpJobState): boolean {
    if (Date.now() >= job.expiresAt * 1000) {
      setDlpJob(null);
      notify("error", t("preparedExpired"));
      return false;
    }
    try {
      const link = document.createElement("a");
      link.href = dlpDownloadPath(job.jobId);
      link.download = "";
      link.referrerPolicy = "no-referrer";
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setDlpJob((current) => current?.jobId === job.jobId ? {
        ...current,
        message: t("readyDownload"),
        progress: 100,
        downloadStarted: true,
      } : current);
      notify("success", t("browserDownloadStarted"));
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("downloadFailed");
      console.error("pinchana_dlp_file_download_failed", reason);
      notify("error", t("downloadFailedWithReason", {message}));
      return false;
    }
  }

  function downloadReadyDlp() {
    if (submitInFlight.current || dlpJob?.phase !== "ready" || !dlpReadyMatches) return;
    setOpenMenu(null);
    startDlpDownload(dlpJob);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const targetUrl = url.trim();
    if (gate !== "verified" || working || mediaMorphing || submitInFlight.current) return;
    if (result && resolvedUrl === targetUrl) return;
    try {
      const parsed = new URL(targetUrl);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    } catch {
      notify("error", t("validPublicUrl"));
      return;
    }
    const skipMotion = reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const youtubeTarget = isYouTubeUrl(targetUrl);
    const requestKey = dlpRequestKey;

    submitInFlight.current = true;
    setMediaMorphing(!youtubeTarget);
    setDownloadState("");
    let urlTransitionFinished: Promise<void> = Promise.resolve();

    try {
      const enterLoadingState = () => {
        clearMediaPreview();
        setDlpJob(youtubeTarget ? {
          phase: "processing",
          sourceUrl: targetUrl,
          requestKey,
          jobId: "",
          expiresAt: 0,
          message: t("startingWorker"),
          progress: null,
          size: null,
          downloadStarted: false,
        } : null);
        setWorkingKind(youtubeTarget ? "dlp" : "scrape");
        setWorking(true);
      };
      cancelLayoutTransition();
      if (!skipMotion && document.startViewTransition) {
        const transition = document.startViewTransition(() => flushSync(enterLoadingState));
        trackLayoutTransition(transition);
        urlTransitionFinished = transition.finished.catch(() => undefined);
        await transition.updateCallbackDone;
      } else {
        enterLoadingState();
      }

      if (youtubeTarget) {
        const [readyJob] = await Promise.all([runDlpJob(targetUrl, requestKey), urlTransitionFinished]);
        setResolvedUrl(targetUrl);
        setDlpJob(readyJob);
        if (autoSave) startDlpDownload(readyJob);
        return;
      }

      const [response] = await Promise.all([
        fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        }),
        urlTransitionFinished,
      ]);
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setGate("challenge");
          setGateMessage(t("sessionExpired"));
        }
        throw new Error(payload.error || t("processFailed"));
      }
      const scrapeResult = parseScrapeResponse(payload);
      const firstVisualAsset = assetsFor(scrapeResult, filenameStyle).find((asset) => asset.kind !== "audio");
      if (firstVisualAsset) {
        setDownloadState(t("loadingPreview"));
        await preloadPreviewAsset(firstVisualAsset);
      }
      const mountResult = () => {
        autoSaved.current = null;
        setActiveSlide(0);
        setDownloadState("");
        setResolvedUrl(targetUrl);
        setResult(scrapeResult);
      };
      flushSync(mountResult);
      if (!skipMotion) await waitForNextPaint();
      flushSync(() => setWorking(false));
      if (!skipMotion) await new Promise((resolve) => window.setTimeout(resolve, 180));
    } catch (reason) {
      setResolvedUrl("");
      setResult(null);
      if (youtubeTarget) setDlpJob(null);
      notify("error", reason instanceof Error ? reason.message : t("processFailed"));
    } finally {
      submitInFlight.current = false;
      setMediaMorphing(false);
      setWorking(false);
      setWorkingKind(null);
    }
  }

  const previewAssets = previewAssetsFor(assets);
  const slideshowAudio = soundtrackFor(assets);
  const showAudioOnly = downloadMode === "audio";
  const hasVisualMedia = previewAssets.some((asset) => asset.kind === "video" || asset.kind === "image");
  const isAudioCard = downloadMode === "audio" && !hasVisualMedia;
  const showVisualAudioRail = hasVisualMedia && (showAudioOnly || Boolean(slideshowAudio));
  const previewWorking = working && workingKind === "scrape";
  const showMediaPreview = previewWorking || Boolean(result);
  const mediaPhase = previewWorking ? "loading" : mediaMorphing ? "revealing" : "ready";

  const activatePlayer = useCallback((playerId: string) => {
    setActivePlayerId(playerId);
  }, []);

  function moveSlide(direction: -1 | 1) {
    setActivePlayerId(null);
    setActiveSlide((current) => (current + direction + previewAssets.length) % previewAssets.length);
  }

  function selectSlide(index: number) {
    setActivePlayerId(null);
    setActiveSlide(index);
  }

  function toggleFlyout(
    menu: "mode" | "services" | "youtube-options",
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (menu === "mode" && musicModeLocked) return;
    setSettingsOpen(false);
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const desiredHeight = menu === "mode" ? 118 : (menu === "youtube-options" ? 240 : 300);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 18);
    const spaceAbove = Math.max(0, rect.top - 18);
    const minimumUsefulSpace = Math.min(desiredHeight, menu === "mode" ? 118 : 240);
    const side = menu === "youtube-options" ? "below" : (spaceBelow >= minimumUsefulSpace || spaceBelow >= spaceAbove ? "below" : "above");
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
    document.title = t("settingsTitle");
    requestAnimationFrame(() => {
      const focusId = showMobileIndex ? "settings-index-title" : `settings-title-${section ?? settingsSection}`;
      document.getElementById(focusId)?.focus();
    });
  }

  function renderPreview(asset: DownloadAsset, index: number) {
    const playerId = `preview:${index}:${asset.url}`;
    if (asset.kind === "video") {
      return (
        <VideoPlayer
          key={asset.url}
          playerId={playerId}
          src={asset.url}
          poster={asset.poster}
          width={asset.dimensions?.width}
          height={asset.dimensions?.height}
          label={displayTitle}
          active={activePlayerId === playerId}
          enabled={index === activeSlide}
          volume={slideshowVolume}
          muted={previewMuted}
          onActivate={activatePlayer}
          onVolumeChange={setSlideshowVolume}
          onMutedChange={setPreviewMuted}
        />
      );
    }
    if (asset.kind === "audio") {
      return (
        <AudioPlayer
          key={asset.url}
          playerId={playerId}
          src={asset.url}
          title={asset.title || displayTitle}
          subtitle={asset.artist || displayAuthor || result?.music?.album || undefined}
          coverUrl={coverUrl}
          active={activePlayerId === playerId}
          enabled={index === activeSlide}
          volume={slideshowVolume}
          muted={previewMuted}
          onActivate={activatePlayer}
          onVolumeChange={setSlideshowVolume}
          onMutedChange={setPreviewMuted}
        />
      );
    }
    return (
      <img
        key={asset.url}
        src={asset.url}
        alt={t("mediaAlt", {number: index + 1})}
        width={asset.dimensions?.width}
        height={asset.dimensions?.height}
      />
    );
  }

  return (
    <main className="app-shell" data-view={settingsOpen ? "settings" : "workspace"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <div className="primary-view" inert={settingsOpen ? true : undefined} aria-hidden={settingsOpen}>

      <LanguagePicker />

      <header className={`brand-block ${result || (working && workingKind !== "dlp") ? "is-hidden" : ""}`}>
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
        aria-label={gate === "challenge" && turnstileInteractive ? t("securityVerification") : undefined}
        aria-hidden={gate !== "challenge" || !turnstileInteractive}
      >
        <div className="turnstile-panel">
          {gate === "challenge" && turnstileInteractive && (
            <p className="turnstile-message" role={turnstileErrorCode ? "alert" : "status"}>{gateMessage}</p>
          )}
          <div ref={turnstileHost} className="turnstile-host" />
          {gate === "challenge" && turnstileInteractive && turnstileErrorCode && (
            <button className="turnstile-retry" type="button" onClick={retryTurnstile}>{t("retrySecurity")}</button>
          )}
        </div>
      </div>

      <section className={`workspace ${showMediaPreview ? "has-result" : ""} ${previewWorking ? "is-loading" : ""}`}>
        <p className="sr-only" aria-live="polite">{gateMessage}</p>

        {showMediaPreview && (
          <div className="result-slot">
            <article
              className="result-card"
              data-phase={mediaPhase}
              aria-busy={previewWorking || mediaMorphing}
              aria-label={previewWorking ? t("fetchingMedia") : t("mediaPreview")}
            >
              <div className="media-loading" aria-hidden={!previewWorking}>
                <span className="media-loading-spinner" aria-hidden="true" />
                <div className="fetch-placeholder-copy">
                  <p>{isYouTubeUrl(url) ? t("youtubeDownload") : t("fetchingMedia")}</p>
                  <small>{downloadState || t("preparingLink")}</small>
                </div>
              </div>

              {result && (
                <div
                  className={`result-content ${showVisualAudioRail ? "has-audio-rail" : ""}`}
                  aria-hidden={previewWorking || mediaMorphing}
                  inert={previewWorking || mediaMorphing ? true : undefined}
                >
            <div
              className={`media-stage ${!isAudioCard && previewAssets.length > 1 ? "carousel-stage" : ""} ${isAudioCard ? "audio-only-stage" : ""} ${mediaFallback ? "media-fallback" : ""}`}
              tabIndex={!isAudioCard && previewAssets.length > 1 ? 0 : undefined}
              aria-label={!isAudioCard && previewAssets.length > 1 ? t("carousel", {current: activeSlide + 1, total: previewAssets.length}) : undefined}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (!isAudioCard && event.key === "ArrowLeft" && previewAssets.length > 1) moveSlide(-1);
                if (!isAudioCard && event.key === "ArrowRight" && previewAssets.length > 1) moveSlide(1);
              }}
            >
              {isAudioCard ? (
                <div className="audio-only-view" aria-live="polite">
                  {audioPreparing ? (
                    <div className="audio-only-loading">
                      <span className="media-loading-spinner" />
                      <strong>{t("preparingAudio")}</strong>
                      <small>{downloadState}</small>
                    </div>
                  ) : preparedAudio[0] ? (
                    <AudioPlayer
                      playerId="prepared-audio-main"
                      src={preparedAudio[0].previewUrl}
                      title={displayTitle}
                      subtitle={t("files", {count: preparedAudio.length})}
                      coverUrl={coverUrl}
                      active={activePlayerId === "prepared-audio-main"}
                      volume={slideshowVolume}
                      muted={previewMuted}
                      onActivate={activatePlayer}
                      onVolumeChange={setSlideshowVolume}
                      onMutedChange={setPreviewMuted}
                    />
                  ) : (
                    <div className="audio-only-loading"><Icon name="music" /><strong>{t("audioUnavailable")}</strong></div>
                  )}
                </div>
              ) : (
                <>
                  {previewAssets.length > 1 ? (
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
                      <button type="button" className="carousel-control previous" aria-label={t("previousMedia")} onClick={() => moveSlide(-1)}><Icon name="arrow" /></button>
                      <button type="button" className="carousel-control next" aria-label={t("nextMedia")} onClick={() => moveSlide(1)}><Icon name="arrow" /></button>
                      <div className="carousel-dots" aria-label={t("chooseMedia")}>
                        {previewAssets.map((asset, index) => (
                          <button
                            type="button"
                            key={asset.url}
                            className={index === activeSlide ? "active" : ""}
                            aria-label={t("showMedia", {number: index + 1})}
                            aria-current={index === activeSlide ? "true" : undefined}
                            onClick={() => selectSlide(index)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    previewAssets[0] && renderPreview(previewAssets[0], 0)
                  )}
                </>
              )}
            </div>

            {showAudioOnly && hasVisualMedia ? (
              <div className="media-audio-rail" aria-live="polite">
                {audioPreparing ? (
                  <div className="media-audio-state">
                    <span className="media-loading-spinner small" />
                    <span>{t("preparingAudioEllipsis")}</span>
                  </div>
                ) : preparedAudio[0] ? (
                  <CompactAudioPlayer
                    playerId="prepared-audio-rail"
                    src={preparedAudio[0].previewUrl}
                    label={t("audioOnlyPreview")}
                    active={activePlayerId === "prepared-audio-rail"}
                    volume={slideshowVolume}
                    muted={previewMuted}
                    onActivate={activatePlayer}
                    onVolumeChange={setSlideshowVolume}
                    onMutedChange={setPreviewMuted}
                  />
                ) : (
                  <div className="media-audio-state is-error">
                    <Icon name="music" />
                    <span>{t("audioStreamUnavailable")}</span>
                  </div>
                )}
              </div>
            ) : slideshowAudio ? (
              <div className="media-audio-rail">
                <CompactAudioPlayer
                  playerId="slideshow-audio"
                  src={slideshowAudio.url}
                  label={t("slideshowSoundtrack")}
                  active={activePlayerId === "slideshow-audio"}
                  volume={slideshowVolume}
                  muted={previewMuted}
                  onActivate={activatePlayer}
                  onVolumeChange={setSlideshowVolume}
                  onMutedChange={setPreviewMuted}
                />
              </div>
            ) : null}

            <div className="result-footer" aria-live="polite">
              <div className="result-summary">
                <h2>{displayTitle}</h2>
                <p>
                  {displayAuthor && <span>{t("byAuthor", {author: displayAuthor})}</span>}
                  {displayAuthor && <span aria-hidden="true"> · </span>}
                  <span>{t("files", {count: assets.length})}{assets.length > 1 && zipMultiple ? " · ZIP" : ""}</span>
                </p>
              </div>
              <button
                className="download-action"
                aria-label={downloadMode === "audio" ? t("downloadAudio") : t("downloadMedia")}
                title={downloadMode === "audio" ? t("downloadAudio") : t("downloadMedia")}
                onClick={() => void downloadAssets(assets, archiveFilename, downloadMode, resultKey)}
                disabled={!assets.length || downloadBusy || audioPreparing || (showAudioOnly && !preparedAudio.length)}
              >
                {downloadBusy ? <span className="button-spinner" /> : <Icon name="download" />}
                <span>{t("download")}</span>
              </button>
            </div>
                </div>
              )}
            </article>
          </div>
        )}


        <form className="url-form" data-state={dlpBusy ? "progress" : dlpReadyMatches ? "ready" : "input"} data-verification={gate === "verified" ? "complete" : "pending"} onSubmit={submit} aria-busy={working || mediaMorphing}>
          {dlpBusy && dlpJob ? (
            <div className="dlp-inline-progress" role="status" aria-live="polite">
              <span className="dlp-progress-service" aria-hidden="true"><FontAwesomeIcon icon={faYoutube} /></span>
              <div className="dlp-progress-copy">
                <div>
                  <strong>{dlpJob.message}</strong>
                  {dlpJob.progress !== null && <span>{Math.round(dlpJob.progress)}%</span>}
                </div>
                <span
                  className="dlp-progress-track"
                  role="progressbar"
                  aria-label={dlpJob.message}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={dlpJob.progress === null ? undefined : Math.round(dlpJob.progress)}
                  data-indeterminate={dlpJob.progress === null}
                >
                  <span style={dlpJob.progress === null ? undefined : { width: `${dlpJob.progress}%` }} />
                </span>
              </div>
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="media-url">{t("mediaUrl")}</label>
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
                  cancelLayoutTransition();
                  clearMediaPreview();
                  setDlpJob(null);
                  setUrl(nextUrl);
                  if (isMusicUrl(nextUrl)) setOpenMenu(null);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder={gate === "verified" ? t("pasteLink") : t("waitingVerification")}
                autoComplete="url"
                inputMode="url"
                disabled={gate !== "verified" || working || mediaMorphing}
                required
              />
              <div className="download-mode-menu" data-open={openMenu === "mode"} data-side={flyoutLayout.side} ref={downloadModeMenu}>
                <button
                  className="download-mode-trigger"
                  type="button"
                  aria-label={t("downloadMode", {mode: downloadMode === "audio" ? t("audioOnly") : t("media")})}
                  title={musicModeLocked ? t("musicRequiresAudio") : t("chooseMode")}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "mode"}
                  disabled={musicModeLocked}
                  onClick={(event) => toggleFlyout("mode", event)}
                >
                  <span>{downloadMode === "audio" ? t("audioOnly") : t("media")}</span>
                  <Icon name="chevronDown" />
                </button>
                <div className="download-mode-options" role="menu" aria-label={t("chooseMode")} style={{ maxHeight: flyoutLayout.maxHeight }}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={downloadMode === "media"}
                    disabled={musicModeLocked}
                    onClick={() => {
                      invalidateReadyDlp();
                      setPreferredDownloadMode("media");
                      setOpenMenu(null);
                    }}
                  >
                    <Icon name="video" />
                    <strong>{t("media")}</strong>
                    {downloadMode === "media" && <Icon name="check" />}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={downloadMode === "audio"}
                    onClick={() => {
                      invalidateReadyDlp();
                      setPreferredDownloadMode("audio");
                      setOpenMenu(null);
                    }}
                  >
                    <Icon name="music" />
                    <strong>{t("audioOnly")}</strong>
                    {downloadMode === "audio" && <Icon name="check" />}
                  </button>
                </div>
              </div>
              {dlpReadyMatches ? (
                <>
                  <div className="youtube-download-hint" role="status" aria-live="polite">
                    <strong>
                      {dlpJob?.downloadStarted ? t("downloadStarted") : t("ready")}
                      {dlpSizeLabel ? ` · ${dlpSizeLabel}` : ""}
                    </strong>
                    {dlpIsLarge && <small>{t("largeFile")}</small>}
                  </div>
                  <button
                    className="submit-button ready-download-button"
                    type="button"
                    aria-label={t("downloadPrepared")}
                    title={dlpSizeLabel ? t("downloadPreparedWithSize", {size: dlpSizeLabel}) : t("downloadPrepared")}
                    onClick={downloadReadyDlp}
                  >
                    <Icon name="download" />
                  </button>
                </>
              ) : (
                <button className="submit-button" type="submit" aria-label={t("processUrl")} title={isYouTubeUrl(url) && !dlpAvailable ? t("youtubeUnsupported") : resultMatchesUrl ? t("alreadyLoaded") : undefined} disabled={gate !== "verified" || working || mediaMorphing || !normalizedUrl || resultMatchesUrl || (isYouTubeUrl(url) && !dlpAvailable)}>
                  {working ? <span className="spinner" /> : <Icon name="arrowUp" />}
                </button>
              )}
            </>
          )}
        </form>
        <nav className="workspace-actions" aria-label={t("applicationControls")}>
          <div className="preview-notice" role="status" aria-label={t("previewVersion")}>
            <span className="preview-stripes" aria-hidden="true" />
            <span className="preview-label">{t("previewWarning")}</span>
          </div>
          {isYouTubeUrl(url) && (
            <div className="youtube-popover-wrapper">
              <div className="workspace-popover" data-open={openMenu === "youtube-options"} data-side={flyoutLayout.side} ref={youtubeMenu}>
                <button
                  className="workspace-popover-trigger youtube-trigger"
                  type="button"
                  aria-label={t("youtubeOptionsAria")}
                  aria-haspopup="dialog"
                  aria-expanded={openMenu === "youtube-options"}
                  onClick={(event) => toggleFlyout("youtube-options", event)}
                >
                  <FontAwesomeIcon icon={faYoutube} />
                  <span className="youtube-trigger-copy">
                    <span>{t("youtubeOptions")}</span>
                    <small>{t("cookiesSupported")}</small>
                  </span>
                </button>
                <div
                  className="workspace-popover-panel youtube-options-panel"
                  role="dialog"
                  aria-labelledby="youtube-options-title"
                  style={{ maxHeight: flyoutLayout.maxHeight }}
                >
                  <header className="workspace-popover-header">
                    <h2 id="youtube-options-title">{t("youtubeAccess")}</h2>
                    <p>{t("anonymousPublic")}</p>
                  </header>
                  <div className="youtube-cookie-support">
                    <span className="youtube-cookie-support-icon" aria-hidden="true"><FontAwesomeIcon icon={faLock} /></span>
                    <span>
                      <strong>{t("accountCookies")}</strong>
                      <small>{t("cookiePrivacy")}</small>
                    </span>
                  </div>
                  <label className="youtube-options-row" htmlFor="youtube-flyout-profile">
                    <span>{t("cookieProfile")}</span>
                    <select
                      id="youtube-flyout-profile"
                      value={selectedProfileId}
                      onChange={(event) => {
                        invalidateReadyDlp();
                        setSelectedProfileId(event.target.value);
                      }}
                      disabled={!dlpAvailable || !vaultUnlocked}
                    >
                      <option value="">{t("anonymous")}</option>
                      {vaultProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!vaultUnlocked ? (
                    <button
                      className="youtube-options-settings-btn"
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        setAccentCookies(true);
                        openSettings("youtube");
                      }}
                    >
                      <span>{vaultExistsState ? t("unlockVault") : t("createVault")}</span>
                      <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                  ) : (
                    <button
                      className="youtube-options-settings-btn"
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        openSettings("youtube");
                      }}
                    >
                      <span>{t("openYoutubeSettings")}</span>
                      <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="workspace-popover" data-open={openMenu === "services"} data-side={flyoutLayout.side} ref={servicesMenu}>
            <button className="workspace-popover-trigger" type="button" aria-label={t("availableServices")} aria-haspopup="dialog" aria-expanded={openMenu === "services"} onClick={(event) => toggleFlyout("services", event)}><Icon name="services" /><span>{t("services")}</span></button>
            <div className="workspace-popover-panel services-panel" role="dialog" aria-labelledby="services-title" aria-describedby="services-description" style={{ maxHeight: flyoutLayout.maxHeight }}>
              <header className="workspace-popover-header">
                <h2 id="services-title">{t("availableServices")}</h2>
                <p id="services-description">{t("servicesDescription")}</p>
              </header>
              <ul>
                {(activeServices.length > 0 ? activeServices : supportedPlatforms.map((platform) => platform.name)).map((name) => (
                  <li key={name}>
                    <span className="service-icon" aria-hidden="true"><FontAwesomeIcon icon={supportedPlatformIcons.get(name) ?? faGlobe} /></span>
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <button
              ref={settingsTrigger}
              className="workspace-popover-trigger settings-trigger"
              type="button"
              aria-label={t("settings")}
              title={t("settings")}
              aria-expanded={settingsOpen}
              onClick={() => openSettings()}
            >
              <Icon name="settings" />
            </button>
          </div>
        </nav>
        {gate === "error" && <button className="verification-retry" onClick={() => void checkSession()}>{t("retryVerification")}</button>}

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
          {t("telegramPrompt")}{" "}
          <a href="https://t.me/pinchanabot" target="_blank" rel="noopener noreferrer" className="tg-button">
            {t("openTelegram")}
          </a>
        </span>
        <Link href="/policy" className="footer-link-btn">
          {t("privacyPolicy")}
        </Link>
        <span className="footer-separator" aria-hidden="true" />
        <Link href="/usage" className="footer-link-btn">
          {t("terms")}
        </Link>
        <span className="footer-separator" aria-hidden="true" />
        <a href="https://docs.pinchana.cc" className="footer-link-btn">
          {t("docs")}
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
        filenameStyle={filenameStyle}
        onFilenameStyle={(value) => { invalidateReadyDlp(); setFilenameStyle(value); }}
        pawsEnabled={pawsEnabled}
        onPawsEnabled={setPawsEnabled}
        reduceMotion={reduceMotion}
        onReduceMotion={setReduceMotion}
        dlpAvailable={dlpAvailable}
        dlpQuality={dlpQuality}
        onDlpQuality={(value) => { invalidateReadyDlp(); setDlpQuality(value); }}
        dlpQualities={dlpQualities}
        dlpCodec={dlpCodec}
        onDlpCodec={(value) => { invalidateReadyDlp(); setDlpCodec(value); }}
        dlpCodecs={dlpCodecs}
        onDlpContainer={(value) => { invalidateReadyDlp(); setDlpContainer(value); }}
        dlpContainer={dlpContainer}
        dlpContainers={dlpContainers}
        dlpAudioFormat={dlpAudioFormat}
        onDlpAudioFormat={(value) => { invalidateReadyDlp(); setDlpAudioFormat(value); }}
        dlpAudioFormats={dlpAudioFormats}
        dlpAudioBitrate={dlpAudioBitrate}
        onDlpAudioBitrate={(value) => { invalidateReadyDlp(); setDlpAudioBitrate(value); }}
        dlpAudioBitrates={dlpAudioBitrates}
        preferBetterAudio={preferBetterAudio}
        onPreferBetterAudio={(value) => { invalidateReadyDlp(); setPreferBetterAudio(value); }}
        betterAudioAvailable={betterAudioAvailable}
        dubLanguage={dubLanguage}
        onDubLanguage={(value) => { invalidateReadyDlp(); setDubLanguage(value); }}
        dubLanguages={dubLanguages}
        subtitleLanguage={subtitleLanguage}
        onSubtitleLanguage={(value) => { invalidateReadyDlp(); setSubtitleLanguage(value); }}
        subtitleLanguages={subtitleLanguages}
        convertTwitterGifs={convertTwitterGifs}
        onConvertTwitterGifs={setConvertTwitterGifs}
        apiOrigin={apiOrigin}
        onApiOrigin={setApiOrigin}
        apiCustom={apiCustom}
        apiStatus={apiStatus}
        apiSaving={apiSaving}
        onConnectApi={saveApiOrigin}
        onUseDefaultApi={useDefaultApiOrigin}
        selectedProfileId={selectedProfileId}
        onSelectProfile={(profileId) => { invalidateReadyDlp(); setSelectedProfileId(profileId); }}
        onProfiles={(profiles, unlocked) => { setVaultProfiles(profiles); setVaultUnlocked(unlocked); if (!unlocked) { invalidateReadyDlp(); setSelectedProfileId(""); } }}
        accentCookies={accentCookies}
        onAccentCookiesReset={() => setAccentCookies(false)}
        webVersion={WEB_VERSION}
        webCommit={WEB_COMMIT}
        apiBuild={apiBuild}
        deviceSnapshot={deviceSnapshot}
        activity={activity}
        sessionStatus={gate === "verified" ? t("sessionVerified") : gate === "checking" ? t("sessionChecking") : t("sessionWaiting")}
        apiInstanceLabel={apiCustom ? t("customApi") : t("defaultApi")}
        healthyServiceCount={activeServices.length}
        dlpStatus={dlpAvailable ? t("dlpAvailable") : t("dlpUnavailable")}
        onCopyDiagnostics={() => void copyDiagnostics()}
      />
    </main>
  );
}
