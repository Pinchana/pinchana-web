"use client";

import Script from "next/script";
import Link from "next/link";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowUp, faCheck, faChevronDown, faDownload, faGear, faGlobe, faLink, faLock, faMusic, faVideo } from "@fortawesome/free-solid-svg-icons";
import { faDeezer, faInstagram, faSoundcloud, faSpotify, faThreads, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { useTranslations } from "next-intl";
import CookieConsent from "./components/CookieConsent";
import LanguagePicker from "./components/LanguagePicker";
import type { CookieVaultHandle, VaultProfileSummary } from "./components/CookieVault";
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
  parseScrapeResponse,
  resultAuthor,
  resultTitle,
} from "./lib/scrape-result";
import {
  BuildManifest,
  DeviceSnapshot,
  collectDeviceSnapshot,
  sanitizeBuildManifest,
} from "./lib/diagnostics";
import { usePrivacyPreferences } from "./lib/use-privacy-preferences";

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

type ScrapeStatus = "idle" | "resolving" | "processing" | "ready" | "download_started" | "expired" | "failed";

const WEB_VERSION = "preview";
const RAW_WEB_COMMIT = process.env.NEXT_PUBLIC_PINCHANA_WEB_COMMIT || "development";
const WEB_COMMIT = /^[0-9a-f]{7,40}$/i.test(RAW_WEB_COMMIT) ? RAW_WEB_COMMIT.toLowerCase() : "development";
const RAW_MAX_ARCHIVE_ITEMS = Number(process.env.NEXT_PUBLIC_PINCHANA_V2_MAX_ARCHIVE_ITEMS || "32");
const MAX_ARCHIVE_ITEMS = Number.isInteger(RAW_MAX_ARCHIVE_ITEMS)
  ? Math.min(100, Math.max(1, RAW_MAX_ARCHIVE_ITEMS))
  : 32;
const EMPTY_BUILD_MANIFEST: BuildManifest = { version: "preview", commits: {} };

const supportedPlatforms: { name: string; icon: IconDefinition }[] = [
  { name: "instagram", icon: faInstagram },
  { name: "tiktok", icon: faTiktok },
  { name: "twitter", icon: faXTwitter },
  { name: "youtube", icon: faYoutube },
  { name: "threads", icon: faThreads },
  { name: "spotify", icon: faSpotify },
  { name: "soundcloud", icon: faSoundcloud },
  { name: "deezer", icon: faDeezer },
];

const supportedPlatformIcons = new Map(supportedPlatforms.map((platform) => [platform.name, platform.icon]));

function Icon({ name }: { name: "arrow" | "arrowUp" | "check" | "chevronDown" | "download" | "link" | "music" | "services" | "settings" | "video" }) {
  if (name === "arrow") return <FontAwesomeIcon icon={faArrowRight} />;
  if (name === "arrowUp") return <FontAwesomeIcon icon={faArrowUp} />;
  if (name === "check") return <FontAwesomeIcon icon={faCheck} />;
  if (name === "chevronDown") return <FontAwesomeIcon icon={faChevronDown} />;
  if (name === "download") return <FontAwesomeIcon icon={faDownload} />;
  if (name === "link") return <FontAwesomeIcon icon={faLink} />;
  if (name === "music") return <FontAwesomeIcon icon={faMusic} />;
  if (name === "services") return <FontAwesomeIcon icon={faGlobe} />;
  if (name === "settings") return <FontAwesomeIcon icon={faGear} />;
  return <FontAwesomeIcon icon={faVideo} />;
}

function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  } catch {
    return false;
  }
}

function isMusicUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return ["spotify.com", "soundcloud.com", "deezer.com", "music.youtube.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function triggerBrowserDownload(url: string, filename?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename && (url.startsWith("blob:") || url.startsWith("data:"))) {
    anchor.download = filename;
  }
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function loadSetting<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem("pinchana-settings");
    if (!stored) return fallback;
    const saved = JSON.parse(stored) as Record<string, unknown>;
    return (saved[key] !== undefined ? saved[key] : fallback) as T;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const t = useTranslations("home");
  const privacy = usePrivacyPreferences();

  const turnstileErrorMessage = useCallback((code: string) => {
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
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeV2Job, setScrapeV2Job] = useState<{ jobId: string; expiresAt: number; retryAfter: number; progress: number | null } | null>(null);
  const [working, setWorking] = useState(false);
  const [workingKind, setWorkingKind] = useState<"scrape" | "dlp" | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [dlpJob, setDlpJob] = useState<DlpJobState | null>(null);
  const [openMenu, setOpenMenu] = useState<"mode" | "services" | "youtube-options" | null>(null);
  const [flyoutLayout, setFlyoutLayout] = useState<{ side: "above" | "below"; maxHeight: number }>({ side: "below", maxHeight: 440 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [settingsMobileIndex, setSettingsMobileIndex] = useState(false);

  const [autoSave, setAutoSave] = useState<boolean>(() => loadSetting("autoSave", true));
  const [zipMultiple, setZipMultiple] = useState<boolean>(() => loadSetting("zipMultiple", true));
  const [filenameStyle, setFilenameStyle] = useState<FilenameStyle>(() => {
    const saved = loadSetting("filenameStyle", "pretty");
    return FILENAME_STYLES.some((option) => option.value === saved) ? (saved as FilenameStyle) : "pretty";
  });
  const [pawsEnabled, setPawsEnabled] = useState<boolean>(() => loadSetting("pawsEnabled", true));
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => loadSetting("reduceMotion", false));
  const [convertTwitterGifs, setConvertTwitterGifs] = useState<boolean>(() => loadSetting("convertTwitterGifs", true));
  const [preferredDownloadMode, setPreferredDownloadMode] = useState<DownloadMode>(() => {
    const saved = loadSetting("downloadMode", "media");
    return (saved === "media" || saved === "audio") ? saved : "media";
  });
  const [dlpQuality, setDlpQuality] = useState<DlpQuality>(() => {
    const saved = loadSetting("dlpQuality", "1080p");
    return DLP_VIDEO_QUALITIES.some((option) => option.value === saved) ? (saved as DlpQuality) : "1080p";
  });
  const [dlpCodec, setDlpCodec] = useState<DlpCodec>(() => {
    const saved = loadSetting("dlpCodec", "h264");
    return DLP_CODECS.some((option) => option.value === saved) ? (saved as DlpCodec) : "h264";
  });
  const [dlpContainer, setDlpContainer] = useState<DlpContainer>(() => {
    const saved = loadSetting("dlpContainer", "mp4");
    return DLP_CONTAINERS.some((option) => option.value === saved) ? (saved as DlpContainer) : "mp4";
  });
  const [dlpAudioFormat, setDlpAudioFormat] = useState<DlpAudioFormat>(() => {
    const saved = loadSetting("dlpAudioFormat", "mp3");
    return DLP_AUDIO_FORMATS.some((option) => option.value === saved) ? (saved as DlpAudioFormat) : "mp3";
  });
  const [dlpAudioBitrate, setDlpAudioBitrate] = useState<DlpAudioBitrate>(() => {
    const saved = loadSetting("dlpAudioBitrate", "128");
    return DLP_AUDIO_BITRATES.some((option) => option.value === saved) ? (saved as DlpAudioBitrate) : "128";
  });
  const [preferBetterAudio, setPreferBetterAudio] = useState<boolean>(() => loadSetting("preferBetterAudio", false));
  const [dubLanguage, setDubLanguage] = useState<string>(() => loadSetting("dubLanguage", "original"));
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>(() => loadSetting("subtitleLanguage", "none"));

  const [turnstileSiteKey, setTurnstileSiteKey] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "");
  const [apiOrigin, setApiOrigin] = useState("");
  const [apiCustom, setApiCustom] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [apiSaving, setApiSaving] = useState(false);
  const [apiBuild, setApiBuild] = useState<BuildManifest>(EMPTY_BUILD_MANIFEST);
  const [deviceSnapshot, setDeviceSnapshot] = useState<DeviceSnapshot | null>(null);
  const [dlpAvailable, setDlpAvailable] = useState(false);
  const [dlpQualities, setDlpQualities] = useState<DlpQuality[]>([]);
  const [dlpCodecs, setDlpCodecs] = useState<DlpCodec[]>([]);
  const [dlpContainers, setDlpContainers] = useState<DlpContainer[]>([]);
  const [dlpAudioFormats, setDlpAudioFormats] = useState<DlpAudioFormat[]>([]);
  const [dlpAudioBitrates, setDlpAudioBitrates] = useState<DlpAudioBitrate[]>([]);
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
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
  const downloadModeMenu = useRef<HTMLDivElement>(null);
  const servicesMenu = useRef<HTMLDivElement>(null);
  const youtubeMenu = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);
  const settingsReturnTitle = useRef("Pinchana");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const cookieVaultRef = useRef<CookieVaultHandle>(null);
  const submitInFlight = useRef(false);
  const submitSeq = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    document.title = settingsReturnTitle.current;
    requestAnimationFrame(() => settingsReturnFocus.current?.focus());
  }, []);

  const notify = useCallback((type: NotificationType, message: string) => {
    toast[type](message, { duration: 4_500 });
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
  const dlpSizeLabel = dlpJob?.size ? formatDownloadSize(dlpJob.size) : null;
  const dlpIsLarge = dlpJob?.size ? isLargeDownload(dlpJob.size) : false;

  const displayTitle = useMemo(() => result ? resultTitle(result) : "", [result]);
  const displayAuthor = useMemo(() => result ? resultAuthor(result) : "", [result]);

  const activity = useMemo(() => {
    if (working) return t("processingLink");
    if (result) return t("mediaLoaded");
    return t("idle");
  }, [result, t, working]);

  useEffect(() => {
    let active = true;
    const snapshotFrame = requestAnimationFrame(() => setDeviceSnapshot(collectDeviceSnapshot()));
    void vaultExists().then((exists) => {
      if (active) setVaultExistsState(exists);
    });
    return () => { active = false; cancelAnimationFrame(snapshotFrame); };
  }, []);

  useEffect(() => () => {
    pollAbortRef.current?.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const checkSession = useCallback(async () => {
    setGate("checking");
    setGateMessage(t("sessionChecking"));

    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = await response.json();
      if (payload.turnstile_site_key) setTurnstileSiteKey(payload.turnstile_site_key);
      setApiCustom(payload.api_custom === true);
      setApiOrigin(payload.api_custom && typeof payload.api_origin === "string" ? payload.api_origin : "");

      const available = Array.isArray(payload.active_services) ? payload.active_services : [];
      setActiveServices(available);
      setDlpAvailable(payload.dlp_available === true);
      setDlpQualities(Array.isArray(payload.dlp_qualities) ? payload.dlp_qualities : []);
      setDlpCodecs(Array.isArray(payload.dlp_codecs) ? payload.dlp_codecs : []);
      setDlpContainers(Array.isArray(payload.dlp_containers) ? payload.dlp_containers : []);
      setDlpAudioFormats(Array.isArray(payload.dlp_audio_formats) ? payload.dlp_audio_formats : []);
      setDlpAudioBitrates(Array.isArray(payload.dlp_audio_bitrates) ? payload.dlp_audio_bitrates : []);
      setDubLanguages(Array.isArray(payload.dub_languages) ? payload.dub_languages : []);
      setSubtitleLanguages(Array.isArray(payload.subtitle_languages) ? payload.subtitle_languages : []);
      setBetterAudioAvailable(payload.better_audio_available === true);

      if (payload.build_manifest && typeof payload.build_manifest === "object") {
        setApiBuild(sanitizeBuildManifest(payload.build_manifest as BuildManifest));
      }

      if (response.ok && payload.verified) {
        setGate("verified");
        setGateMessage(t("sessionVerified"));
        return;
      }

      setGate("challenge");
      setGateMessage(t("securityCheckRequired"));
    } catch {
      setGate("challenge");
      setGateMessage(t("checkServiceUnavailable"));
    }
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => void checkSession());
  }, [checkSession]);

  useEffect(() => {
    localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave, zipMultiple, filenameStyle, pawsEnabled, reduceMotion, convertTwitterGifs, downloadMode: preferredDownloadMode, dlpQuality, dlpCodec, dlpContainer, dlpAudioFormat, dlpAudioBitrate, preferBetterAudio, dubLanguage, subtitleLanguage }));
  }, [autoSave, convertTwitterGifs, dlpAudioBitrate, dlpAudioFormat, dlpCodec, dlpContainer, dlpQuality, dubLanguage, filenameStyle, preferBetterAudio, zipMultiple, pawsEnabled, preferredDownloadMode, reduceMotion, subtitleLanguage]);

  const setInteractionVisible = useCallback((visible: boolean) => {
    turnstileInteractiveRef.current = visible;
    setTurnstileInteractive(visible);
  }, []);

  useEffect(() => {
    if (gate !== "challenge" || !scriptReady || !turnstileHost.current || widgetId.current || !turnstileSiteKey) return;

    widgetId.current = window.turnstile?.render(turnstileHost.current, {
      sitekey: turnstileSiteKey,
      theme: "dark",
      size: "compact",
      execution: "render",
      "before-interactive-callback": () => {
        if (!turnstileErrorCodeRef.current) setInteractionVisible(false);
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
    }) || null;

    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      turnstileInteractiveRef.current = false;
      turnstileErrorCodeRef.current = null;
    };
  }, [gate, reportTurnstileError, scriptReady, setInteractionVisible, t, turnstileErrorMessage, turnstileSiteKey]);

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

  async function downloadAsset(item: DownloadAsset) {
    if (!(convertTwitterGifs && item.kind === "video" && item.looping)) {
      triggerBrowserDownload(item.url, item.name);
      setScrapeStatus("download_started");
      return;
    }
    setDownloadBusy(true);
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(t("fetchFailed", { name: item.name }));
      const source = await response.blob();
      const { convertToGif } = await import("./lib/audio-converter");
      const extension = item.name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || "mp4";
      const output = await convertToGif(source, extension);
      const objectUrl = URL.createObjectURL(output);
      triggerBrowserDownload(objectUrl, `${item.name.replace(/\.[^.]+$/, "")}.gif`);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setScrapeStatus("download_started");
      notify("success", t("downloadSaved"));
    } catch {
      notify("error", t("downloadFailed"));
    } finally {
      setDownloadBusy(false);
    }
  }

  async function downloadZipArchive(items: DownloadAsset[], archiveName: string) {
    if (items.length > MAX_ARCHIVE_ITEMS) {
      notify("error", t("archiveItemLimit", { count: MAX_ARCHIVE_ITEMS }));
      return;
    }
    setDownloadBusy(true);
    try {
      const { downloadZip } = await import("client-zip");
      const inputs = await Promise.all(items.map(async (item) => {
        const resp = await fetch(item.url);
        if (!resp.ok) throw new Error(t("fetchFailed", { name: item.name }));
        if (!(convertTwitterGifs && item.kind === "video" && item.looping)) {
          return { input: resp, name: item.name };
        }
        const source = await resp.blob();
        const { convertToGif } = await import("./lib/audio-converter");
        const extension = item.name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || "mp4";
        return {
          input: await convertToGif(source, extension),
          name: `${item.name.replace(/\.[^.]+$/, "")}.gif`,
        };
      }));
      const blob = await downloadZip(inputs).blob();
      triggerBrowserDownload(URL.createObjectURL(blob), archiveName);
      setScrapeStatus("download_started");
      notify("success", t("downloadSaved"));
    } catch {
      notify("error", t("downloadFailed"));
    } finally {
      setDownloadBusy(false);
    }
  }

  function startPollingV2Job(
    jobId: string,
    expiresAtTs: number | undefined,
    initialDelaySec: number | undefined,
    seq: number,
  ) {
    if (pollAbortRef.current) pollAbortRef.current.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const controller = new AbortController();
    pollAbortRef.current = controller;

    let delay = (initialDelaySec || 2) * 1000;
    const poll = async () => {
      if (submitSeq.current !== seq || controller.signal.aborted) return;

      if (expiresAtTs && Date.now() / 1000 > expiresAtTs) {
        setScrapeStatus("expired");
        return;
      }

      try {
        const resp = await fetch(`/api/v2/jobs/${jobId}`, { signal: controller.signal });
        const payload = await resp.json().catch(() => ({}));

        if (submitSeq.current !== seq || controller.signal.aborted) return;

        if (!resp.ok) {
          if (resp.status === 404 || resp.status === 410) {
            setScrapeStatus("expired");
          } else {
            setScrapeStatus("failed");
            setScrapeError(payload.error || payload.detail || t("processFailed"));
          }
          return;
        }

        if (payload.status === "ready") {
          const parsed = parseScrapeResponse(payload);
          setResult(parsed);
          setScrapeStatus("ready");
          const readyAssets = assetsFor(parsed, filenameStyle);
          if (autoSave && readyAssets.length > 0) {
            if (readyAssets.length > 1 && zipMultiple) {
              void downloadZipArchive(readyAssets, archiveFilenameFor(parsed, filenameStyle));
            } else {
              for (const asset of readyAssets) void downloadAsset(asset);
              setScrapeStatus("download_started");
            }
          }
          return;
        }

        if (payload.status === "failed") {
          setScrapeStatus("failed");
          setScrapeError(payload.error || t("processFailed"));
          return;
        }

        if (payload.status === "expired") {
          setScrapeStatus("expired");
          return;
        }

        if (payload.status === "processing") {
          if (typeof payload.progress === "number") {
            setScrapeV2Job((curr) => curr ? { ...curr, progress: payload.progress } : null);
          }
          const serverRetry = payload.retry_after ? payload.retry_after * 1000 : delay;
          delay = Math.min(Math.max(serverRetry, delay * 1.5), 10000);
          pollTimerRef.current = setTimeout(poll, delay);
        }
      } catch {
        if (submitSeq.current !== seq || controller.signal.aborted) return;
        delay = Math.min(delay * 1.5, 10000);
        pollTimerRef.current = setTimeout(poll, delay);
      }
    };

    pollTimerRef.current = setTimeout(poll, delay);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (submitInFlight.current || !normalizedUrl || gate !== "verified") return;

    submitInFlight.current = true;
    pollAbortRef.current?.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    submitSeq.current += 1;
    const seq = submitSeq.current;

    setWorking(true);
    setWorkingKind("scrape");
    setResult(null);
    setScrapeStatus("resolving");
    setScrapeError(null);
    setResolvedUrl(normalizedUrl);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalizedUrl,
          options: {
            audioFormat: dlpAudioFormat,
            audioBitrate: dlpAudioBitrate,
            filenameStyle,
            preferBetterAudio,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (submitSeq.current !== seq) return;

      if (!response.ok) {
        throw new Error(payload.error || t("processFailed"));
      }

      if (payload.status === "processing") {
        setScrapeStatus("processing");
        setScrapeV2Job({
          jobId: payload.job_id,
          expiresAt: payload.expires_at || Math.floor(Date.now() / 1000) + 300,
          retryAfter: payload.retry_after || 2,
          progress: payload.progress ?? null,
        });
        startPollingV2Job(payload.job_id, payload.expires_at, payload.retry_after, seq);
        return;
      }

      if (payload.status === "ready") {
        const parsed = parseScrapeResponse(payload);
        setResult(parsed);
        setScrapeStatus("ready");
        const readyAssets = assetsFor(parsed, filenameStyle);
        if (autoSave && readyAssets.length > 0) {
          if (readyAssets.length > 1 && zipMultiple) {
            void downloadZipArchive(readyAssets, archiveFilenameFor(parsed, filenameStyle));
          } else {
            for (const asset of readyAssets) void downloadAsset(asset);
            setScrapeStatus("download_started");
          }
        }
      }
    } catch (err) {
      if (submitSeq.current !== seq) return;
      setScrapeStatus("failed");
      setScrapeError(err instanceof Error ? err.message : t("processFailed"));
      notify("error", err instanceof Error ? err.message : t("processFailed"));
    } finally {
      if (submitSeq.current === seq) {
        setWorking(false);
        setWorkingKind(null);
        submitInFlight.current = false;
      }
    }
  }

  function downloadReadyDlp() {
    if (!dlpJob || dlpJob.phase !== "ready") return;
    triggerBrowserDownload(dlpDownloadPath(dlpJob.jobId));
    setDlpJob((current) => current ? { ...current, downloadStarted: true } : current);
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

  const copyDiagnostics = useCallback(async () => {
    const payload = JSON.stringify({
      version: WEB_VERSION,
      commit: WEB_COMMIT,
      apiBuild,
      deviceSnapshot,
    }, null, 2);
    await navigator.clipboard.writeText(payload);
    notify("success", t("diagnosticsCopied"));
  }, [apiBuild, deviceSnapshot, notify, t]);

  const showResultArea = scrapeStatus !== "idle";

  return (
    <main className="app-shell" data-view={settingsOpen ? "settings" : "workspace"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <div className="primary-view" inert={settingsOpen ? true : undefined} aria-hidden={settingsOpen}>
        <LanguagePicker />

        <header className={`brand-block ${showResultArea ? "is-hidden" : ""}`}>
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

        <section className={`workspace ${showResultArea ? "has-result" : ""}`}>
          <p className="sr-only" aria-live="polite">{gateMessage}</p>

          {showResultArea && (
            <div className="result-slot">
              <article className="result-card compact-result-card" aria-label={t("resultManifest")}>
                <header className="result-card-header">
                  <span className="platform-tag">{result?.source.platform || "Media"}</span>
                  <div className="result-meta-copy">
                    <h2>{displayTitle || t("extractedAsset")}</h2>
                    {displayAuthor && <p className="author-name">@{displayAuthor}</p>}
                  </div>
                </header>

                {scrapeStatus === "resolving" && (
                  <div className="status-box resolving" role="status">
                    <span className="spinner" />
                    <span>{t("resolvingMedia")}</span>
                  </div>
                )}

                {scrapeStatus === "processing" && (
                  <div className="status-box processing" role="status">
                    <span className="spinner" />
                    <span>{scrapeV2Job?.progress != null ? t("processingJobProgress", { progress: Math.round(scrapeV2Job.progress) }) : t("processingJob")}</span>
                    <div className="dlp-progress-track" role="progressbar">
                      <span style={{ width: `${scrapeV2Job?.progress ?? 50}%` }} />
                    </div>
                  </div>
                )}

                {scrapeStatus === "expired" && (
                  <div className="status-box expired" role="alert">
                    <p>{t("ticketExpired")}</p>
                    <button type="button" onClick={() => void submit()} className="retry-action-btn">{t("scrapeAgain")}</button>
                  </div>
                )}

                {scrapeStatus === "failed" && (
                  <div className="status-box failed" role="alert">
                    <p>{scrapeError || t("processFailed")}</p>
                    <button type="button" onClick={() => void submit()} className="retry-action-btn">{t("retry")}</button>
                  </div>
                )}

                {(scrapeStatus === "ready" || scrapeStatus === "download_started") && (
                  <div className="result-assets-container">
                    {scrapeStatus === "download_started" && (
                      <div className="download-initiated-notice" role="status">
                        <Icon name="check" />
                        <span>{t("downloadInitiated")}</span>
                      </div>
                    )}

                    {result?.content.availability && (
                      <div className="audio-availability-summary" data-availability={result.content.availability}>
                        <strong>
                          {result.content.availability === "preview"
                            ? t("availabilityPreview")
                            : result.content.availability === "metadata-only"
                              ? t("availabilityMetadataOnly")
                              : t("availabilityFull")}
                        </strong>
                        {result.content.album ? <span>{result.content.album}</span> : null}
                        {result.content.duration_seconds ? <span>{Math.round(result.content.duration_seconds)}s</span> : null}
                      </div>
                    )}

                    {result?.collection && result.collection.length > 0 && (
                      <div className="collection-metadata" data-testid="collection-metadata">
                        <strong>
                          {result.content.collection_truncated
                            ? t("collectionItemsTruncated", {
                              resolved: result.collection.length,
                              count: result.content.item_count || result.collection.length,
                            })
                            : t("collectionItems", { count: result.collection.length })}
                        </strong>
                        <div className="collection-items">
                          {result.collection.map((item) => (
                            <div className="collection-item" key={`${item.index}:${item.item_id}`}>
                              <span className="asset-num">#{item.index + 1}</span>
                              <span className="asset-name">{item.title}</span>
                              {item.artist ? <span className="asset-details">{item.artist}</span> : null}
                              {item.duration_seconds ? <span className="asset-details">{Math.round(item.duration_seconds)}s</span> : null}
                              <span className="asset-type-tag">
                                {item.availability === "preview"
                                  ? t("availabilityPreview")
                                  : item.availability === "metadata-only"
                                    ? t("availabilityMetadataOnly")
                                    : item.delivery_status === "processing-required"
                                      ? t("processingRequired")
                                      : t("availabilityFull")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="assets-list">
                      {assets.map((asset, idx) => (
                        <div className="asset-item-row" key={asset.url}>
                          <span className="asset-num">#{idx + 1}</span>
                          <span className="asset-type-tag">{asset.kind}</span>
                          <span className="asset-name" title={asset.name}>{asset.name}</span>
                          <span className="asset-details">
                            {asset.dimensions ? `${asset.dimensions.width}×${asset.dimensions.height}` : ""}
                            {asset.duration ? ` · ${Math.round(asset.duration)}s` : ""}
                            {asset.size ? ` · ${formatDownloadSize(asset.size)}` : ""}
                          </span>
                          {convertTwitterGifs && asset.kind === "video" && asset.looping ? (
                            <button
                              type="button"
                              className="download-asset-btn"
                              disabled={downloadBusy}
                              onClick={() => void downloadAsset(asset)}
                            >
                              <Icon name="download" />
                              <span>{asset.availability === "preview" ? t("downloadPreview") : t("download")}</span>
                            </button>
                          ) : (
                            <a
                              href={asset.url}
                              className="download-asset-btn"
                              onClick={() => window.setTimeout(() => setScrapeStatus("download_started"), 0)}
                            >
                              <Icon name="download" />
                              <span>{asset.availability === "preview" ? t("downloadPreview") : t("download")}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>

                    {assets.length > 1 && zipMultiple && (
                      <div className="zip-action-row">
                        <button
                          type="button"
                          className="download-zip-btn"
                          disabled={downloadBusy}
                          onClick={() => void downloadZipArchive(assets, archiveFilename)}
                        >
                          {downloadBusy ? <span className="spinner" /> : <Icon name="download" />}
                          <span>{t("downloadAllZip")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            </div>
          )}

          <form className="url-form" data-state={dlpBusy ? "progress" : dlpReadyMatches ? "ready" : "input"} data-verification={gate === "verified" ? "complete" : "pending"} onSubmit={(e) => void submit(e)}>
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
                    setResult(null);
                    setScrapeStatus("idle");
                    setDlpJob(null);
                    setUrl(nextUrl);
                    if (isMusicUrl(nextUrl)) setOpenMenu(null);
                  }}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder={gate === "verified" ? t("pasteLink") : t("waitingVerification")}
                  autoComplete="url"
                  inputMode="url"
                  disabled={gate !== "verified" || working}
                  required
                />
                <div className="download-mode-menu" data-open={openMenu === "mode"} data-side={flyoutLayout.side} ref={downloadModeMenu}>
                  <button
                    className="download-mode-trigger"
                    type="button"
                    aria-label={t("downloadMode", { mode: downloadMode === "audio" ? t("audioOnly") : t("media") })}
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
                      title={dlpSizeLabel ? t("downloadPreparedWithSize", { size: dlpSizeLabel }) : t("downloadPrepared")}
                      onClick={downloadReadyDlp}
                    >
                      <Icon name="download" />
                    </button>
                  </>
                ) : (
                  <button className="submit-button" type="submit" aria-label={t("processUrl")} title={isYouTubeUrl(url) && !dlpAvailable ? t("youtubeUnsupported") : resultMatchesUrl ? t("alreadyLoaded") : undefined} disabled={gate !== "verified" || working || !normalizedUrl || resultMatchesUrl || (isYouTubeUrl(url) && !dlpAvailable)}>
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
        </footer>

        <CookieConsent
          ready={privacy.ready}
          acknowledged={privacy.acknowledged}
          anonymousAnalytics={privacy.anonymousAnalytics}
          onSave={privacy.saveAnonymousAnalytics}
        />
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
        anonymousAnalytics={privacy.anonymousAnalytics}
        onAnonymousAnalytics={privacy.saveAnonymousAnalytics}
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
