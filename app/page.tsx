"use client";

/* Authenticated media cannot use the Next image optimizer because its server-side
   fetch does not carry the visitor's HttpOnly Pinchana session cookie. */
/* eslint-disable @next/next/no-img-element */

import Script from "next/script";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import CookieConsent from "./components/CookieConsent";

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
type GateState = "checking" | "challenge" | "verifying" | "verified" | "error";

const supportedPlatforms = [
  "TikTok",
  "Instagram",
  "YouTube Shorts",
  "SoundCloud",
  "YouTube Music",
  "Spotify",
  "Deezer",
  "Threads",
  "Twitter / X",
];

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
    return result.carousel
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
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function Icon({ name }: { name: "settings" | "info" | "arrow" | "close" | "download" | "link" | "arrowUp" }) {
  const paths = {
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14"/></>,
    arrowUp: <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [gate, setGate] = useState<GateState>("checking");
  const [gateMessage, setGateMessage] = useState("Checking verification…");
  const [scriptReady, setScriptReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [downloadState, setDownloadState] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [autoSave, setAutoSave] = useState(true);
  const [zipMultiple, setZipMultiple] = useState(true);
  const turnstileHost = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const infoDialog = useRef<HTMLDialogElement>(null);
  const autoSaved = useRef<string | null>(null);

  const assets = useMemo(() => result ? assetsFor(result) : [], [result]);

  const displayTitle = useMemo(() => {
    if (!result) return "Ready to save";
    const text = result.title || result.caption || "Ready to save";
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }, [result]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pinchana-settings") || "{}");
      queueMicrotask(() => {
        if (typeof saved.autoSave === "boolean") setAutoSave(saved.autoSave);
        if (typeof saved.zipMultiple === "boolean") setZipMultiple(saved.zipMultiple);
      });
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave, zipMultiple }));
  }, [autoSave, zipMultiple]);

  const checkSession = useCallback(async () => {
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
    queueMicrotask(() => void checkSession());
  }, [checkSession]);

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
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (gate !== "challenge" || !scriptReady || !host || !window.turnstile || widgetId.current) return;
    if (!sitekey) {
      queueMicrotask(() => {
        setGate("error");
        setGateMessage("Turnstile site key is not configured");
      });
      return;
    }

    widgetId.current = window.turnstile.render(host, {
      sitekey,
      theme: "dark",
      size: "flexible",
      action: "turnstile-spin-v1",
      callback: async (token: string) => {
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
        setGate("challenge");
        setGateMessage("Check expired — try again");
      },
      "error-callback": () => {
        setGate("challenge");
        setGateMessage("Check failed — try again");
      },
    });

    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [gate, scriptReady]);

  const downloadAssets = useCallback(async (items: DownloadAsset[], archiveName: string) => {
    if (!items.length) return;
    setDownloadState("Preparing download…");
    try {
      if (items.length > 1 && zipMultiple) {
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
      setDownloadState("Saved");
    } catch (reason) {
      setDownloadState(reason instanceof Error ? reason.message : "Download failed");
    }
  }, [zipMultiple]);

  useEffect(() => {
    if (!result || !autoSave || !assets.length) return;
    const key = JSON.stringify(result);
    if (autoSaved.current === key) return;
    autoSaved.current = key;
    void downloadAssets(assets, result.title || result.shortcode);
  }, [assets, autoSave, downloadAssets, result]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (gate !== "verified" || working) return;
    setError("");
    setDownloadState("");
    try {
      const parsed = new URL(url);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    } catch {
      setError("Enter a valid public URL.");
      return;
    }

    const enterLoadingState = () => {
      setResult(null);
      setActiveSlide(0);
      setWorking(true);
    };
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(enterLoadingState));
    } else {
      enterLoadingState();
    }
    try {
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
      setError(reason instanceof Error ? reason.message : "Could not process this URL.");
    } finally {
      setWorking(false);
    }
  }

  const previewAssets = assets;

  function moveSlide(direction: -1 | 1) {
    setActiveSlide((current) => (current + direction + previewAssets.length) % previewAssets.length);
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
    <main className="app-shell">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />


      <header className="brand-block">
        <div className="brand-mark" aria-hidden="true" style={{ color: "#fff" }}>
          <svg className="brand-logo" viewBox="0 0 512 512" width="22" height="22" fill="currentColor">
            <path d="M461.814,197.514c-2.999-11.335-14.624-18.093-25.958-15.094c-1.866,0.553-13.477,3.649-26.042,14.341c-6.234,5.349-12.633,12.751-17.361,22.454c-4.748,9.69-7.685,21.577-7.657,35.033c0.013,16.345,4.133,34.895,13.442,56.257c6.282,14.403,9.144,29.697,9.144,44.846c0.062,25.627-8.438,50.756-21.121,68.283c-6.296,8.777-13.546,15.606-20.816,20.022c-2.986,1.81-5.943,3.131-8.888,4.181l0.989-5.854c-0.055-17.03-4.05-34.84-13.021-50.528c-28.356-49.643-66.223-134.741-66.223-134.741l-1.527-4.879c29.47-7.796,58.579-23.408,73.148-54.985c38.931-84.344-41.08-142.73-41.08-142.73s-25.958-56.222-38.924-54.06c-12.978,2.164-41.094,38.931-41.094,38.931h-23.788h-23.788c0,0-28.108-36.767-41.08-38.931c-12.979-2.163-38.924,54.06-38.924,54.06s-80.018,58.386-41.087,142.73c13.822,29.953,40.741,45.572,68.634,53.748l-2.951,9.662c0,0-31.908,81.552-60.279,131.195C37.198,441.092,58.478,512,97.477,512c29.47,0,79.14,0,101.692,0c7.292,0,11.763,0,11.763,0c22.544,0,72.222,0,101.691,0c12.654,0,23.38-7.547,31.204-19.324c15.826-0.013,30.81-4.872,43.707-12.758c19.455-11.915,34.708-30.32,45.434-51.896c10.685-21.618,16.856-46.636,16.878-72.672c0-20.484-3.885-41.619-12.682-61.813c-7.561-17.34-9.918-30.216-9.904-39.29c0.028-7.526,1.5-12.544,3.359-16.414c1.417-2.889,3.124-5.17,4.983-7.091c2.771-2.868,5.964-4.879,8.349-6.054c1.182-0.595,2.135-0.968,2.674-1.162l0.449-0.152l-0.007-0.028C458.179,220.189,464.779,208.724,461.814,197.514z"/>
          </svg>
        </div>
        <div>
          <h1>Pinchana</h1>
          <p>Paste. Pinch. Save.</p>
        </div>
      </header>

      <nav className="corner-actions" aria-label="Application controls">
        <button className="icon-button" aria-label="Settings" title="Settings" onClick={() => settingsDialog.current?.showModal()}><Icon name="settings" /></button>
        <button className="icon-button" aria-label="Information" title="Information" onClick={() => infoDialog.current?.showModal()}><Icon name="info" /></button>
      </nav>

      <section className={`workspace ${working || result ? "has-result" : ""} ${working ? "is-loading" : ""}`}>
        <p className="sr-only" aria-live="polite">{gateMessage}</p>
        <div ref={turnstileHost} className={gate === "challenge" ? "turnstile-host" : "turnstile-host hidden"} />

        {working && (
          <article className="result-card loading-card" aria-live="polite" aria-label="Fetching media">
            <div className="media-loading">
              <span className="media-loading-spinner" />
              <p>Fetching media</p>
              <small>Pinchana is preparing your link…</small>
            </div>
            <div className="loading-copy" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="loading-download" aria-hidden="true">
              <span />
              <span />
            </div>
          </article>
        )}

        {result && (
          <article className="result-card">
            <div
              className={`media-stage ${previewAssets.length > 1 ? "carousel-stage" : ""}`}
              tabIndex={previewAssets.length > 1 ? 0 : undefined}
              aria-label={previewAssets.length > 1 ? `Media carousel, item ${activeSlide + 1} of ${previewAssets.length}` : undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" && previewAssets.length > 1) moveSlide(-1);
                if (event.key === "ArrowRight" && previewAssets.length > 1) moveSlide(1);
              }}
            >
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

            <div className="result-copy">
              <div>
                <h2>{displayTitle}</h2>
                {result.author && <p className="author">by {result.author}</p>}
              </div>
            </div>

            <div className="download-bar" aria-live="polite">
              <div>
                <span>{downloadState || (autoSave ? "Automatic download ready" : "Ready to download")}</span>
                <small>{assets.length > 1 && zipMultiple ? "ZIP archive" : `${assets.length} file${assets.length === 1 ? "" : "s"}`}</small>
              </div>
              <button onClick={() => void downloadAssets(assets, result.title || result.shortcode)} disabled={!assets.length || downloadState === "Preparing download…"}>
                <Icon name="download" />
                Download
              </button>
            </div>
          </article>
        )}

        <form className="url-form" onSubmit={submit} aria-busy={working}>
          <label className="sr-only" htmlFor="media-url">Media URL</label>
          <span className="url-leading" aria-hidden="true">
            {gate === "verified" ? <Icon name="link" /> : <span className="verification-spinner" />}
          </span>
          <input
            id="media-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            placeholder={gate === "verified" ? "Paste a link" : "Waiting for verification"}
            autoComplete="url"
            inputMode="url"
            disabled={gate !== "verified" || working}
            required
          />
          <button type="submit" aria-label="Process URL" disabled={gate !== "verified" || working || !url.trim()}>
            {working ? <span className="spinner" /> : <Icon name="arrowUp" />}
          </button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
        {gate === "error" && <button className="verification-retry" onClick={() => void checkSession()}>Retry verification</button>}

      </section>

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
        <a href="https://github.com/Pinchana/pinchana-web" target="_blank" rel="noopener noreferrer" className="github-link">
          <svg className="github-icon" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
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

      <dialog ref={settingsDialog} className="modal" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="modal-panel">
          <div className="modal-heading"><div><p className="eyebrow">Preferences</p><h2>Settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => settingsDialog.current?.close()}><Icon name="close" /></button></div>
          <label className="setting-row"><span><strong>Save immediately</strong><small>Start the browser download when media is ready.</small></span><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /></label>
          <label className="setting-row"><span><strong>ZIP multiple files</strong><small>Combine carousels and track lists in your browser.</small></span><input type="checkbox" checked={zipMultiple} onChange={(event) => setZipMultiple(event.target.checked)} /></label>
          <p className="privacy-note">These preferences stay on this device.</p>
        </div>
      </dialog>

      <dialog ref={infoDialog} className="modal" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="modal-panel info-panel">
          <div className="modal-heading"><div><p className="eyebrow">About</p><h2>Pinchana</h2></div><button className="icon-button" aria-label="Close information" onClick={() => infoDialog.current?.close()}><Icon name="close" /></button></div>
          <p>Paste a supported media link. Pinchana prepares it, previews it here, and saves it directly through your browser.</p>
          <h3>Supported platforms</h3>
          <ul>{supportedPlatforms.map((platform) => <li key={platform}>{platform}</li>)}</ul>
          <p className="privacy-note">Turnstile verification protects the service from automated abuse. Download preferences never leave your browser.</p>
        </div>
      </dialog>
      <CookieConsent />
    </main>
  );
}
