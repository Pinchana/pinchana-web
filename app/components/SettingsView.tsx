"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowUpRightFromSquare, faChevronRight, faCircleInfo, faCopy, faFilm, faMusic, faServer, faSliders } from "@fortawesome/free-solid-svg-icons";
import { faGithub, faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import {useLocale, useTranslations} from "next-intl";
import CookieVault, { CookieVaultHandle, VaultProfileSummary } from "./CookieVault";
import SettingsSwitch from "./SettingsSwitch";
import { FILENAME_STYLES, FilenameStyle, formatFilename } from "../lib/filename";
import { BuildManifest, DeviceSnapshot, commitUrl } from "../lib/diagnostics";

export type SettingsSection = "general" | "youtube" | "instance" | "about";
export type DlpQuality = "best" | "8k" | "4k" | "1440p" | "1080p" | "720p" | "480p" | "360p" | "240p" | "144p" | "audio";
export type DlpCodec = "auto" | "h264" | "av1" | "vp9";
export type DlpContainer = "auto" | "mp4" | "webm" | "mkv";
export type DlpAudioFormat = "best" | "mp3" | "ogg" | "wav" | "opus";
export type DlpAudioBitrate = "320" | "256" | "128" | "96" | "64" | "8";

export const DLP_VIDEO_QUALITIES: { value: Exclude<DlpQuality, "audio">; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "8k", label: "8K+" },
  { value: "4k", label: "4K" },
  { value: "1440p", label: "1440p" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
  { value: "240p", label: "240p" },
  { value: "144p", label: "144p" },
];

export const DLP_CODECS: { value: DlpCodec; label: string; detail?: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "h264", label: "H.264", detail: "AAC" },
  { value: "av1", label: "AV1", detail: "Opus" },
  { value: "vp9", label: "VP9", detail: "Opus" },
];

export const DLP_CONTAINERS: { value: DlpContainer; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mkv", label: "MKV" },
];

export const DLP_AUDIO_FORMATS: { value: DlpAudioFormat; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "mp3", label: "MP3" },
  { value: "ogg", label: "OGG" },
  { value: "wav", label: "WAV" },
  { value: "opus", label: "Opus" },
];

export const DLP_AUDIO_BITRATES: { value: DlpAudioBitrate; label: string }[] = [
  { value: "320", label: "320 kb/s" },
  { value: "256", label: "256 kb/s" },
  { value: "128", label: "128 kb/s" },
  { value: "96", label: "96 kb/s" },
  { value: "64", label: "64 kb/s" },
  { value: "8", label: "8 kb/s" },
];

type Props = {
  open: boolean;
  activeSection: SettingsSection;
  mobileIndex: boolean;
  onSectionChange: (section: SettingsSection) => void;
  onMobileIndexChange: (visible: boolean) => void;
  onClose: () => void;
  autoSave: boolean;
  onAutoSave: (value: boolean) => void;
  zipMultiple: boolean;
  onZipMultiple: (value: boolean) => void;
  filenameStyle: FilenameStyle;
  onFilenameStyle: (value: FilenameStyle) => void;
  pawsEnabled: boolean;
  onPawsEnabled: (value: boolean) => void;
  reduceMotion: boolean;
  onReduceMotion: (value: boolean) => void;
  dlpAvailable: boolean;
  dlpQuality: DlpQuality;
  onDlpQuality: (value: DlpQuality) => void;
  dlpQualities: DlpQuality[];
  dlpCodec: DlpCodec;
  onDlpCodec: (value: DlpCodec) => void;
  dlpCodecs: DlpCodec[];
  dlpContainer: DlpContainer;
  onDlpContainer: (value: DlpContainer) => void;
  dlpContainers: DlpContainer[];
  dlpAudioFormat: DlpAudioFormat;
  onDlpAudioFormat: (value: DlpAudioFormat) => void;
  dlpAudioFormats: DlpAudioFormat[];
  dlpAudioBitrate: DlpAudioBitrate;
  onDlpAudioBitrate: (value: DlpAudioBitrate) => void;
  dlpAudioBitrates: DlpAudioBitrate[];
  preferBetterAudio: boolean;
  onPreferBetterAudio: (value: boolean) => void;
  betterAudioAvailable: boolean;
  dubLanguage: string;
  onDubLanguage: (value: string) => void;
  dubLanguages: string[];
  subtitleLanguage: string;
  onSubtitleLanguage: (value: string) => void;
  subtitleLanguages: string[];
  convertTwitterGifs: boolean;
  onConvertTwitterGifs: (value: boolean) => void;
  apiOrigin: string;
  onApiOrigin: (value: string) => void;
  apiCustom: boolean;
  apiStatus: string;
  apiSaving: boolean;
  onConnectApi: (event: FormEvent<HTMLFormElement>) => void;
  onUseDefaultApi: () => void;
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  onProfiles: (profiles: VaultProfileSummary[], unlocked: boolean) => void;
  accentCookies?: boolean;
  onAccentCookiesReset?: () => void;
  webVersion: string;
  webCommit: string;
  apiBuild: BuildManifest;
  deviceSnapshot: DeviceSnapshot | null;
  activity: string;
  sessionStatus: string;
  apiInstanceLabel: string;
  healthyServiceCount: number;
  dlpStatus: string;
  onCopyDiagnostics: () => void;
};

const sectionDefinitions = [
  { id: "general" as const, icon: faSliders },
  { id: "youtube" as const, icon: faYoutube },
  { id: "instance" as const, icon: faServer },
  { id: "about" as const, icon: faCircleInfo },
];

const BUILD_LABELS: Record<string, string> = {
  api: "API release",
  gateway: "Gateway",
  core: "Core",
  dlp: "YouTube DLP",
  instagram: "Instagram",
  shorts: "YouTube Shorts",
  soundcloud: "SoundCloud",
  ytmusic: "YouTube Music",
  spotify: "Spotify",
  deezer: "Deezer",
  threads: "Threads",
  twitter: "Twitter / X",
  tiktok: "TikTok",
};

const TRANSLATION_GUIDE_URL = "https://docs.pinchana.cc/translating/";

function DiagnosticRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="diagnostic-rows">
      {rows.map((row) => (
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
    </dl>
  );
}

function languageLabel(code: string, locale: string): string {
  try {
    if (typeof Intl.DisplayNames === "function") {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code === "iw" ? "he" : code) ?? code;
    }
  } catch {}
  return code;
}

function SelectSetting<T extends string>({ id, label, description, options, value, disabled, onChange }: {
  id: string;
  label: string;
  description: string;
  options: { value: T; label: string; detail?: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="settings-select-row" htmlFor={id} data-disabled={disabled}>
      <span className="settings-control-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.detail ? `${option.label} · ${option.detail}` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const SettingsView = forwardRef<CookieVaultHandle, Props>(function SettingsView(props, ref) {
  const vaultRef = useRef<CookieVaultHandle>(null);
  const t = useTranslations("settings");
  const languageT = useTranslations("language");
  const locale = useLocale();
  const sections = sectionDefinitions.map((section) => ({
    ...section,
    label: t(`sections.${section.id}`),
  }));

  useImperativeHandle(ref, () => ({
    selectedCookiesForUrl(profileId: string, url: string) {
      if (!vaultRef.current) throw new Error(t("vaultUnavailable"));
      return vaultRef.current.selectedCookiesForUrl(profileId, url);
    },
    unlocked: () => vaultRef.current?.unlocked() ?? false,
  }), [t]);

  const qualityOptions = DLP_VIDEO_QUALITIES
    .filter((option) => !props.dlpQualities.length || props.dlpQualities.includes(option.value))
    .map((option) => option.value === "best" ? {...option, label: t("options.best")} : option);
  const selectedQuality = qualityOptions.some((option) => option.value === props.dlpQuality)
    ? props.dlpQuality as Exclude<DlpQuality, "audio">
    : qualityOptions[0]?.value ?? "best";
  const codecOptions = DLP_CODECS.filter((option) => !props.dlpCodecs.length || props.dlpCodecs.includes(option.value)).map((option) => option.value === "auto" ? {...option, label: t("options.auto")} : option);
  const containerOptions = DLP_CONTAINERS.filter((option) => !props.dlpContainers.length || props.dlpContainers.includes(option.value)).map((option) => option.value === "auto" ? {...option, label: t("options.auto")} : option);
  const audioFormatOptions = DLP_AUDIO_FORMATS.filter((option) => !props.dlpAudioFormats.length || props.dlpAudioFormats.includes(option.value)).map((option) => option.value === "best" ? {...option, label: t("options.best")} : option);
  const audioBitrateOptions = DLP_AUDIO_BITRATES.filter((option) => !props.dlpAudioBitrates.length || props.dlpAudioBitrates.includes(option.value));
  const selectedAudioFormat = audioFormatOptions.some((option) => option.value === props.dlpAudioFormat) ? props.dlpAudioFormat : audioFormatOptions[0]?.value ?? "best";
  const selectedAudioBitrate = audioBitrateOptions.some((option) => option.value === props.dlpAudioBitrate) ? props.dlpAudioBitrate : audioBitrateOptions[0]?.value ?? "128";
  const dubLanguageOptions = props.dubLanguages
    .map((code) => ({ code, label: languageLabel(code, locale) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const selectedDubLanguage = props.dubLanguage === "original" || props.dubLanguages.includes(props.dubLanguage) ? props.dubLanguage : "original";
  const subtitleLanguageOptions = props.subtitleLanguages
    .map((code) => ({ code, label: languageLabel(code, locale) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const selectedSubtitleLanguage = props.subtitleLanguages.includes(props.subtitleLanguage) ? props.subtitleLanguage : "none";
  const videoFilenamePreview = formatFilename({
    title: t("general.videoTitle"),
    author: t("general.videoAuthor"),
    service: "youtube",
    id: "dQw4w9WgXcQ",
    quality: "1080p",
    codec: "H.264",
    kind: "video",
  }, "mp4", props.filenameStyle);
  const audioFilenamePreview = formatFilename({
    title: t("general.audioTitle"),
    author: t("general.audioAuthor"),
    service: "youtube",
    id: "dQw4w9WgXcQ",
    kind: "audio",
  }, "mp3", props.filenameStyle);
  const codecDescription = props.dlpCodec === "h264"
    ? t("youtube.codecH264")
    : props.dlpCodec === "av1"
      ? t("youtube.codecAv1")
      : props.dlpCodec === "vp9"
        ? t("youtube.codecVp9")
        : t("youtube.codecAuto");
  const containerDescription = props.dlpContainer === "auto"
    ? t("youtube.containerAuto")
    : t("youtube.containerSelected", {container: props.dlpContainer.toUpperCase()});
  const shortWebCommit = props.webCommit === "development" ? t("localBuild") : props.webCommit.slice(0, 7);
  const webCommitUrl = props.webCommit === "development" ? null : `https://github.com/Pinchana/pinchana-web/commit/${props.webCommit}`;
  const apiCommits = Object.entries(props.apiBuild.commits).sort(([left], [right]) => {
    const order = ["api", "gateway", "core", "dlp"];
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex);
    return (BUILD_LABELS[left] || left).localeCompare(BUILD_LABELS[right] || right);
  });

  function navigateSections(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const nextIndex = (index + direction + sections.length) % sections.length;
    props.onSectionChange(sections[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${sections[nextIndex].id}`)?.focus());
  }

  function selectSection(section: SettingsSection) {
    props.onSectionChange(section);
    props.onMobileIndexChange(false);
    if (window.matchMedia("(max-width: 700px)").matches) {
      requestAnimationFrame(() => document.getElementById(`settings-title-${section}`)?.focus());
    }
  }

  return (
    <section
      className="settings-view"
      role="region"
      aria-label={t("ariaLabel")}
      aria-hidden={!props.open}
      data-open={props.open}
      data-mobile-index={props.mobileIndex}
      inert={!props.open ? true : undefined}
    >
      <div className="settings-frame">
        <nav className="settings-navigation" aria-label={t("sectionsLabel")}>
          <div className="settings-nav-top">
            <button
              id="settings-index-title"
              className="settings-back"
              type="button"
              onClick={props.onClose}
              aria-label={t("back")}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>{t("title")}</span>
            </button>
          </div>
          <div className="settings-nav-tabs" role="tablist">
            {sections.map((section, index) => (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={props.activeSection === section.id}
                aria-controls={`settings-panel-${section.id}`}
                data-section={section.id}
                data-active={props.activeSection === section.id}
                tabIndex={props.activeSection === section.id ? 0 : -1}
                onClick={() => selectSection(section.id)}
                onKeyDown={(event) => navigateSections(event, index)}
              >
                <FontAwesomeIcon icon={section.icon} />
                <span className="settings-nav-label">
                  <strong>{section.label}</strong>
                  {section.id === "about" ? <small>{props.webVersion} · {shortWebCommit}</small> : null}
                </span>
                <FontAwesomeIcon className="settings-nav-chevron" icon={faChevronRight} />
              </button>
            ))}
          </div>
        </nav>

        <div className="settings-content">
          <div className="settings-mobile-top">
            <button type="button" onClick={() => props.onMobileIndexChange(true)} aria-label={t("backToAll")}>
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>{t("all")}</span>
            </button>
          </div>

          <section id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={props.activeSection !== "general"}>
            <div className="settings-section-heading">
              <h2 id="settings-title-general" tabIndex={-1}>{t("sections.general")}</h2>
              <p>{t("general.description")}</p>
            </div>
            <div className="settings-general-grid">
              <div className="settings-list">
                <span className="settings-list-label">{t("general.downloads")}</span>
                <SettingsSwitch id="setting-auto-save" label={t("general.saveImmediately")} description={t("general.saveImmediatelyDescription")} checked={props.autoSave} onChange={props.onAutoSave} />
                <SettingsSwitch id="setting-zip-multiple" label={t("general.zip")} description={t("general.zipDescription")} checked={props.zipMultiple} onChange={props.onZipMultiple} />
                <SettingsSwitch id="setting-twitter-gif" label={t("twitter.convertLooping")} description={t("twitter.gifWarning")} checked={props.convertTwitterGifs} onChange={props.onConvertTwitterGifs} />
              </div>
              <div className="settings-list">
                <span className="settings-list-label">{t("general.interface")}</span>
                <SettingsSwitch id="setting-paws" label={t("general.paws")} description={t("general.pawsDescription")} checked={props.pawsEnabled} onChange={props.onPawsEnabled} />
                <SettingsSwitch id="setting-reduce-motion" label={t("general.reduceMotion")} description={t("general.reduceMotionDescription")} checked={props.reduceMotion} onChange={props.onReduceMotion} />
              </div>
            </div>
            <fieldset className="filename-style-setting">
              <legend className="settings-list-label">{t("general.filenameStyle")}</legend>
              <div className="filename-style-options" aria-label={t("general.filenameStyle")}>
                {FILENAME_STYLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={props.filenameStyle === option.value}
                    onClick={() => props.onFilenameStyle(option.value)}
                  >
                    {t(`options.filename.${option.value}`)}
                  </button>
                ))}
              </div>
              <div className="filename-previews" aria-live="polite">
                <div><FontAwesomeIcon icon={faFilm} /><span><strong>{videoFilenamePreview}</strong><small>{t("general.videoPreview")}</small></span></div>
                <div><FontAwesomeIcon icon={faMusic} /><span><strong>{audioFilenamePreview}</strong><small>{t("general.audioPreview")}</small></span></div>
              </div>
              <p>{t("general.filenameNote")}</p>
            </fieldset>
            <div className="translation-contribution">
              <small>{languageT("community")}</small>
              <a href={TRANSLATION_GUIDE_URL} target="_blank" rel="noopener noreferrer">{languageT("helpTranslate")}<FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a>
            </div>
          </section>

          <section id="settings-panel-youtube" role="tabpanel" aria-labelledby="settings-tab-youtube" hidden={props.activeSection !== "youtube"}>
            <div className="settings-section-heading settings-heading-with-status">
              <div>
                <h2 id="settings-title-youtube" tabIndex={-1}>{t("sections.youtube")}</h2>
                <p>{t("youtube.description")}</p>
              </div>
              <div className="settings-status" data-available={props.dlpAvailable}>
                <span aria-hidden="true" />
                {props.dlpAvailable ? t("youtube.available") : t("youtube.unavailable")}
              </div>
            </div>

            <div className="settings-youtube-group">
              <div className="settings-preference-grid">
                <section className="settings-preference-column" aria-labelledby="settings-video-heading">
                  <h3 className="settings-list-label" id="settings-video-heading">{t("youtube.video")}</h3>
                  <SelectSetting
                    id="setting-youtube-quality"
                    label={t("youtube.videoQuality")}
                    description={t("youtube.videoQualityDescription")}
                    options={qualityOptions}
                    value={selectedQuality}
                    disabled={!props.dlpAvailable}
                    onChange={props.onDlpQuality}
                  />
                  <SelectSetting id="setting-youtube-codec" label={t("youtube.videoCodec")} description={codecDescription} options={codecOptions} value={props.dlpCodec} disabled={!props.dlpAvailable || !props.dlpCodecs.length} onChange={props.onDlpCodec} />
                  <SelectSetting id="setting-youtube-container" label={t("youtube.container")} description={containerDescription} options={containerOptions} value={props.dlpContainer} disabled={!props.dlpAvailable || !props.dlpContainers.length} onChange={props.onDlpContainer} />
                  <label className="settings-select-row" htmlFor="setting-youtube-subtitle-language" data-disabled={!props.dlpAvailable || !subtitleLanguageOptions.length}>
                    <span className="settings-control-copy">
                      <strong>{t("youtube.subtitles")}</strong>
                      <small>{t("youtube.subtitlesDescription")}</small>
                    </span>
                    <select id="setting-youtube-subtitle-language" value={selectedSubtitleLanguage} disabled={!props.dlpAvailable || !subtitleLanguageOptions.length} onChange={(event) => props.onSubtitleLanguage(event.target.value)}>
                      <option value="none">{t("youtube.none")}</option>
                      {subtitleLanguageOptions.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
                    </select>
                  </label>
                </section>

                <section className="settings-preference-column" aria-labelledby="settings-audio-heading">
                  <h3 className="settings-list-label" id="settings-audio-heading">{t("youtube.audio")}</h3>
                  <SelectSetting
                    id="setting-youtube-audio-format"
                    label={t("youtube.audioFormat")}
                    description={selectedAudioFormat === "best" ? t("youtube.sourceAudio") : t("youtube.convertAudio", {format: selectedAudioFormat.toUpperCase()})}
                    options={audioFormatOptions}
                    value={selectedAudioFormat}
                    disabled={!props.dlpAvailable || !audioFormatOptions.length}
                    onChange={props.onDlpAudioFormat}
                  />
                  <SelectSetting
                    id="setting-youtube-audio-bitrate"
                    label={t("youtube.audioBitrate")}
                    description={selectedAudioFormat === "best" || selectedAudioFormat === "wav" ? t("youtube.bitrateUnused") : t("youtube.bitrateDescription")}
                    options={audioBitrateOptions}
                    value={selectedAudioBitrate}
                    disabled={!props.dlpAvailable || !audioBitrateOptions.length || selectedAudioFormat === "best" || selectedAudioFormat === "wav"}
                    onChange={props.onDlpAudioBitrate}
                  />
                  <SettingsSwitch
                    id="setting-better-youtube-audio"
                    label={t("youtube.betterAudio")}
                    description={t("youtube.betterAudioDescription")}
                    checked={props.preferBetterAudio}
                    disabled={!props.dlpAvailable || !props.betterAudioAvailable}
                    onChange={props.onPreferBetterAudio}
                  />
                  <label className="settings-select-row" htmlFor="setting-youtube-dub-language" data-disabled={!props.dlpAvailable || !dubLanguageOptions.length}>
                    <span className="settings-control-copy">
                      <strong>{t("youtube.dub")}</strong>
                      <small>{t("youtube.dubDescription")}</small>
                    </span>
                    <select id="setting-youtube-dub-language" value={selectedDubLanguage} disabled={!props.dlpAvailable || !dubLanguageOptions.length} onChange={(event) => props.onDubLanguage(event.target.value)}>
                      <option value="original">{t("youtube.original")}</option>
                      {dubLanguageOptions.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
                    </select>
                  </label>
                </section>
              </div>

              <div className="vault-group-heading">
                <span className="settings-list-label">{t("youtube.cookieProfiles")}</span>
                <p>{t("youtube.cookiePrivacy")}</p>
              </div>
              <CookieVault
                ref={vaultRef}
                selectedProfileId={props.selectedProfileId}
                onSelectProfile={props.onSelectProfile}
                onProfiles={props.onProfiles}
                accentCookies={props.accentCookies}
                onAccentCookiesReset={props.onAccentCookiesReset}
              />
            </div>
          </section>

          <section id="settings-panel-instance" role="tabpanel" aria-labelledby="settings-tab-instance" hidden={props.activeSection !== "instance"}>
            <div className="settings-section-heading">
              <h2 id="settings-title-instance" tabIndex={-1}>{t("sections.instance")}</h2>
              <p>{t("instance.description")}</p>
            </div>
            <div className="settings-instance-grid">
              <div className="settings-instance-summary">
                <div className="instance-status">
                  <span aria-hidden="true" data-custom={props.apiCustom} />
                  <strong>{t("instance.current")}</strong>
                  <small>{props.apiCustom ? t("instance.custom") : t("instance.default")}</small>
                </div>
                {props.apiStatus ? <p className="instance-note" role="status">{props.apiStatus}</p> : null}
              </div>
              <form className="settings-instance-form" onSubmit={props.onConnectApi}>
                <label htmlFor="api-origin"><strong>{t("instance.origin")}</strong><small>{t("instance.originDescription")}</small></label>
                <input id="api-origin" type="url" value={props.apiOrigin} onChange={(event) => props.onApiOrigin(event.target.value)} placeholder="https://api.example.com" spellCheck={false} />
                <div className="instance-actions">
                  <button className="secondary" type="button" disabled={props.apiSaving || !props.apiCustom} onClick={props.onUseDefaultApi}>{t("instance.useDefault")}</button>
                  <button className="primary" type="submit" disabled={props.apiSaving || !props.apiOrigin.trim()}>{props.apiSaving ? t("instance.verifying") : t("instance.connect")}</button>
                </div>
              </form>
            </div>
          </section>

          <section id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" hidden={props.activeSection !== "about"}>
            <div className="settings-section-heading">
              <h2 id="settings-title-about" tabIndex={-1}>{t("about.heading")}</h2>
              <p>{t("about.description")}</p>
            </div>

            <div className="about-release">
              <div>
                <span className="settings-list-label">Pinchana Web</span>
                <strong>{props.webVersion}</strong>
              </div>
              {webCommitUrl ? (
                <a href={webCommitUrl} target="_blank" rel="noopener noreferrer">
                  <code>{shortWebCommit}</code>
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  <span className="sr-only">{t("about.openCommit")}</span>
                </a>
              ) : <code>{shortWebCommit}</code>}
            </div>

            <div className="about-diagnostic-grid">
              <section aria-labelledby="about-runtime-heading">
                <h3 className="settings-list-label" id="about-runtime-heading">{t("about.runtime")}</h3>
                <DiagnosticRows rows={[
                  { label: t("about.activity"), value: props.activity },
                  { label: t("about.session"), value: props.sessionStatus },
                  { label: t("about.api"), value: props.apiInstanceLabel },
                  { label: t("about.youtubeDlp"), value: props.dlpStatus },
                  { label: t("about.services"), value: t("about.healthyServices", {count: props.healthyServiceCount}) },
                ]} />
              </section>
              <section aria-labelledby="about-device-heading">
                <h3 className="settings-list-label" id="about-device-heading">{t("about.device")}</h3>
                <DiagnosticRows rows={props.deviceSnapshot ? [
                  { label: t("about.browser"), value: props.deviceSnapshot.browser },
                  { label: t("about.platform"), value: props.deviceSnapshot.platform },
                  { label: t("about.viewport"), value: props.deviceSnapshot.viewport },
                  { label: t("about.input"), value: props.deviceSnapshot.input },
                  { label: t("about.motion"), value: props.deviceSnapshot.motion },
                  { label: t("about.network"), value: props.deviceSnapshot.connection },
                ] : [{ label: t("about.snapshot"), value: t("about.reading") }]} />
              </section>
            </div>

            <section className="about-builds" aria-labelledby="about-builds-heading">
              <div className="about-subheading">
                <div>
                  <h3 className="settings-list-label" id="about-builds-heading">{t("about.revisions")}</h3>
                  <p>{t("about.revisionsDescription")}</p>
                </div>
                <span>{t("about.revisionCount", {count: apiCommits.length})}</span>
              </div>
              {apiCommits.length ? (
                <div className="about-commit-list">
                  {apiCommits.map(([name, entry]) => {
                    const url = commitUrl(entry);
                    const content = <><span>{BUILD_LABELS[name] || name}</span><code>{entry.commit.slice(0, 7)}</code></>;
                    return url
                      ? <a key={name} href={url} target="_blank" rel="noopener noreferrer">{content}<FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a>
                      : <div key={name}>{content}</div>;
                  })}
                </div>
              ) : <p className="about-empty-builds">{t("about.noManifest")}</p>}
            </section>

            <div className="about-actions">
              <button type="button" onClick={props.onCopyDiagnostics}><FontAwesomeIcon icon={faCopy} />{t("about.copy")}</button>
              <a href="https://github.com/Pinchana" target="_blank" rel="noopener noreferrer"><FontAwesomeIcon icon={faGithub} />{t("about.source")}</a>
              <a href="https://github.com/Pinchana/pinchana-web/issues" target="_blank" rel="noopener noreferrer">{t("about.report")}<FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a>
            </div>
            <p className="about-privacy-note">{t("about.privacy")}</p>
          </section>
        </div>
      </div>
    </section>
  );
});

export default SettingsView;
