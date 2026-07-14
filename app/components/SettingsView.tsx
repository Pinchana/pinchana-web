"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faChevronRight, faServer, faSliders } from "@fortawesome/free-solid-svg-icons";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import CookieVault, { CookieVaultHandle, VaultProfileSummary } from "./CookieVault";

export type SettingsSection = "general" | "youtube" | "instance";
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
};

const sections = [
  { id: "general" as const, label: "General", icon: faSliders },
  { id: "youtube" as const, label: "YouTube", icon: faYoutube },
  { id: "instance" as const, label: "API instance", icon: faServer },
];

function languageLabel(code: string): string {
  try {
    if (typeof Intl.DisplayNames === "function") {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(code === "iw" ? "he" : code) ?? code;
    }
  } catch {}
  return code;
}

function SettingSwitch({ id, label, description, checked, disabled = false, onChange }: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-switch-row" htmlFor={id} data-disabled={disabled}>
      <span className="settings-control-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="setting-switch">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
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

  useImperativeHandle(ref, () => ({
    selectedCookiesForUrl(profileId: string, url: string) {
      if (!vaultRef.current) throw new Error("Cookie Vault is unavailable.");
      return vaultRef.current.selectedCookiesForUrl(profileId, url);
    },
    unlocked: () => vaultRef.current?.unlocked() ?? false,
  }), []);

  const qualityOptions = DLP_VIDEO_QUALITIES.filter((option) => !props.dlpQualities.length || props.dlpQualities.includes(option.value));
  const selectedQuality = qualityOptions.some((option) => option.value === props.dlpQuality)
    ? props.dlpQuality as Exclude<DlpQuality, "audio">
    : qualityOptions[0]?.value ?? "best";
  const codecOptions = DLP_CODECS.filter((option) => !props.dlpCodecs.length || props.dlpCodecs.includes(option.value));
  const containerOptions = DLP_CONTAINERS.filter((option) => !props.dlpContainers.length || props.dlpContainers.includes(option.value));
  const audioFormatOptions = DLP_AUDIO_FORMATS.filter((option) => !props.dlpAudioFormats.length || props.dlpAudioFormats.includes(option.value));
  const audioBitrateOptions = DLP_AUDIO_BITRATES.filter((option) => !props.dlpAudioBitrates.length || props.dlpAudioBitrates.includes(option.value));
  const selectedAudioFormat = audioFormatOptions.some((option) => option.value === props.dlpAudioFormat) ? props.dlpAudioFormat : audioFormatOptions[0]?.value ?? "best";
  const selectedAudioBitrate = audioBitrateOptions.some((option) => option.value === props.dlpAudioBitrate) ? props.dlpAudioBitrate : audioBitrateOptions[0]?.value ?? "128";
  const dubLanguageOptions = props.dubLanguages
    .map((code) => ({ code, label: languageLabel(code) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const selectedDubLanguage = props.dubLanguage === "original" || props.dubLanguages.includes(props.dubLanguage) ? props.dubLanguage : "original";
  const codecDescription = props.dlpCodec === "h264"
    ? "Most compatible; usually capped at 1080p."
    : props.dlpCodec === "av1"
      ? "Efficient at high resolution and HDR."
      : props.dlpCodec === "vp9"
        ? "High-resolution quality with broad support."
        : "Use the best source codec.";
  const containerDescription = props.dlpContainer === "auto"
    ? "Match the container to the selected codec."
    : `Remux to ${props.dlpContainer.toUpperCase()} without transcoding.`;

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
      aria-label="Settings"
      aria-hidden={!props.open}
      data-open={props.open}
      data-mobile-index={props.mobileIndex}
      inert={!props.open ? true : undefined}
    >
      <div className="settings-frame">
        <nav className="settings-navigation" aria-label="Settings sections">
          <div className="settings-nav-top">
            <button
              id="settings-index-title"
              className="settings-back"
              type="button"
              onClick={props.onClose}
              aria-label="Back from settings"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Settings</span>
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
                data-active={props.activeSection === section.id}
                tabIndex={props.activeSection === section.id ? 0 : -1}
                onClick={() => selectSection(section.id)}
                onKeyDown={(event) => navigateSections(event, index)}
              >
                <FontAwesomeIcon icon={section.icon} />
                <strong>{section.label}</strong>
                <FontAwesomeIcon className="settings-nav-chevron" icon={faChevronRight} />
              </button>
            ))}
          </div>
        </nav>

        <div className="settings-content">
          <div className="settings-mobile-top">
            <button type="button" onClick={() => props.onMobileIndexChange(true)} aria-label="Back to all settings">
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>All settings</span>
            </button>
          </div>

          <section id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={props.activeSection !== "general"}>
            <div className="settings-section-heading">
              <h2 id="settings-title-general" tabIndex={-1}>General</h2>
              <p>Download and interface preferences.</p>
            </div>
            <div className="settings-general-grid">
              <div className="settings-list">
                <span className="settings-list-label">Downloads</span>
                <SettingSwitch id="setting-auto-save" label="Save immediately" description="Download files as soon as processing finishes." checked={props.autoSave} onChange={props.onAutoSave} />
                <SettingSwitch id="setting-zip-multiple" label="ZIP multiple files" description="Bundle multi-item results into one archive." checked={props.zipMultiple} onChange={props.onZipMultiple} />
              </div>
              <div className="settings-list">
                <span className="settings-list-label">Interface</span>
                <SettingSwitch id="setting-paws" label="Background paws" description="Show the subtle paw field behind the workspace." checked={props.pawsEnabled} onChange={props.onPawsEnabled} />
                <SettingSwitch id="setting-reduce-motion" label="Reduce motion" description="Remove non-essential transitions and animation." checked={props.reduceMotion} onChange={props.onReduceMotion} />
              </div>
            </div>
          </section>

          <section id="settings-panel-youtube" role="tabpanel" aria-labelledby="settings-tab-youtube" hidden={props.activeSection !== "youtube"}>
            <div className="settings-section-heading settings-heading-with-status">
              <div>
                <h2 id="settings-title-youtube" tabIndex={-1}>YouTube</h2>
                <p>Formats, audio and optional account cookies.</p>
              </div>
              <div className="settings-status" data-available={props.dlpAvailable}>
                <span aria-hidden="true" />
                {props.dlpAvailable ? "Available" : "Unavailable"}
              </div>
            </div>

            <div className="settings-youtube-group">
              <div className="settings-preference-grid">
                <section className="settings-preference-column" aria-labelledby="settings-video-heading">
                  <h3 className="settings-list-label" id="settings-video-heading">Video</h3>
                  <SelectSetting
                    id="setting-youtube-quality"
                    label="Video quality"
                    description="Unavailable resolutions fall back to the next best match."
                    options={qualityOptions}
                    value={selectedQuality}
                    disabled={!props.dlpAvailable}
                    onChange={props.onDlpQuality}
                  />
                  <SelectSetting id="setting-youtube-codec" label="Preferred video codec" description={codecDescription} options={codecOptions} value={props.dlpCodec} disabled={!props.dlpAvailable || !props.dlpCodecs.length} onChange={props.onDlpCodec} />
                  <SelectSetting id="setting-youtube-container" label="File container" description={containerDescription} options={containerOptions} value={props.dlpContainer} disabled={!props.dlpAvailable || !props.dlpContainers.length} onChange={props.onDlpContainer} />
                </section>

                <section className="settings-preference-column" aria-labelledby="settings-audio-heading">
                  <h3 className="settings-list-label" id="settings-audio-heading">Audio</h3>
                  <SelectSetting
                    id="setting-youtube-audio-format"
                    label="Audio format"
                    description={selectedAudioFormat === "best" ? "Keep the best source format without conversion." : `Convert audio to ${selectedAudioFormat.toUpperCase()}.`}
                    options={audioFormatOptions}
                    value={selectedAudioFormat}
                    disabled={!props.dlpAvailable || !audioFormatOptions.length}
                    onChange={props.onDlpAudioFormat}
                  />
                  <SelectSetting
                    id="setting-youtube-audio-bitrate"
                    label="Audio bitrate"
                    description={selectedAudioFormat === "best" || selectedAudioFormat === "wav" ? "Not used for this format." : "Applied when converting lossy audio."}
                    options={audioBitrateOptions}
                    value={selectedAudioBitrate}
                    disabled={!props.dlpAvailable || !audioBitrateOptions.length || selectedAudioFormat === "best" || selectedAudioFormat === "wav"}
                    onChange={props.onDlpAudioBitrate}
                  />
                  <SettingSwitch
                    id="setting-better-youtube-audio"
                    label="Prefer higher-quality YouTube audio"
                    description="Use a separate higher-quality audio stream when available."
                    checked={props.preferBetterAudio}
                    disabled={!props.dlpAvailable || !props.betterAudioAvailable}
                    onChange={props.onPreferBetterAudio}
                  />
                  <label className="settings-select-row" htmlFor="setting-youtube-dub-language" data-disabled={!props.dlpAvailable || !dubLanguageOptions.length}>
                    <span className="settings-control-copy">
                      <strong>Preferred dubbed track</strong>
                      <small>Falls back to the original track when unavailable.</small>
                    </span>
                    <select id="setting-youtube-dub-language" value={selectedDubLanguage} disabled={!props.dlpAvailable || !dubLanguageOptions.length} onChange={(event) => props.onDubLanguage(event.target.value)}>
                      <option value="original">Original</option>
                      {dubLanguageOptions.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
                    </select>
                  </label>
                </section>
              </div>

              <div className="vault-group-heading">
                <span className="settings-list-label">Cookie profiles</span>
                <p>Encrypted locally. Passphrases cannot be recovered.</p>
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
              <h2 id="settings-title-instance" tabIndex={-1}>API instance</h2>
              <p>Choose the Pinchana backend this browser uses.</p>
            </div>
            <div className="settings-instance-grid">
              <div className="settings-instance-summary">
                <div className="instance-status">
                  <span aria-hidden="true" data-custom={props.apiCustom} />
                  <div>
                    <strong>Current connection</strong>
                    <small>{props.apiCustom ? "Verified custom Pinchana instance" : "Using the default Pinchana API"}</small>
                  </div>
                </div>
                {props.apiStatus ? <p className="instance-note" role="status">{props.apiStatus}</p> : null}
              </div>
              <form className="settings-instance-form" onSubmit={props.onConnectApi}>
                <label htmlFor="api-origin"><strong>Instance origin</strong><small>HTTPS origin only; no path is needed.</small></label>
                <input id="api-origin" type="url" value={props.apiOrigin} onChange={(event) => props.onApiOrigin(event.target.value)} placeholder="https://api.example.com" spellCheck={false} />
                <div className="instance-actions">
                  <button className="secondary" type="button" disabled={props.apiSaving || !props.apiCustom} onClick={props.onUseDefaultApi}>Use default</button>
                  <button className="primary" type="submit" disabled={props.apiSaving || !props.apiOrigin.trim()}>{props.apiSaving ? "Verifying…" : "Connect"}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
});

export default SettingsView;
