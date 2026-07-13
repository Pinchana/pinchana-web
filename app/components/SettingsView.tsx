"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faChevronRight, faKey, faServer, faShieldHalved, faSliders } from "@fortawesome/free-solid-svg-icons";
import { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, forwardRef, useImperativeHandle, useRef } from "react";
import CookieVault, { CookieVaultHandle, VaultProfileSummary } from "./CookieVault";

export type SettingsSection = "general" | "private" | "vault" | "instance";
export type DlpQuality = "best" | "8k" | "4k" | "1440p" | "1080p" | "720p" | "480p" | "360p" | "240p" | "144p" | "audio";
export type DlpCodec = "auto" | "h264" | "av1" | "vp9";
export type DlpContainer = "auto" | "mp4" | "webm" | "mkv";

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
  privateMode: boolean;
  onPrivateMode: (value: boolean) => void;
  dlpQuality: DlpQuality;
  onDlpQuality: (value: DlpQuality) => void;
  dlpQualities: DlpQuality[];
  dlpCodec: DlpCodec;
  onDlpCodec: (value: DlpCodec) => void;
  dlpCodecs: DlpCodec[];
  dlpContainer: DlpContainer;
  onDlpContainer: (value: DlpContainer) => void;
  dlpContainers: DlpContainer[];
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
};

const sections = [
  { id: "general" as const, label: "General", icon: faSliders },
  { id: "private" as const, label: "Private downloads", icon: faShieldHalved },
  { id: "vault" as const, label: "Cookie Vault", icon: faKey },
  { id: "instance" as const, label: "API instance", icon: faServer },
];

function SettingSwitch({ id, label, checked, disabled = false, onChange }: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-switch-row" htmlFor={id} data-disabled={disabled}>
      <strong>{label}</strong>
      <span className="setting-switch">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

function ChoiceGroup<T extends string>({ label, description, options, value, disabled, className = "", onChange }: {
  label: string;
  description: string;
  options: { value: T; label: string; detail?: string }[];
  value: T;
  disabled: boolean;
  className?: string;
  onChange: (value: T) => void;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentStyle = {
    "--segment-count": options.length,
    "--segment-index": selectedIndex,
  } as CSSProperties;

  return (
    <fieldset className={`settings-choice-group ${className}`} disabled={disabled}>
      <legend>{label}</legend>
      <div className="settings-segment-scroll">
        <div className="settings-segments" role="radiogroup" aria-label={label} style={segmentStyle}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-label={option.detail ? `${option.label} + ${option.detail}` : option.label}
              aria-checked={value === option.value}
              data-selected={value === option.value}
              onClick={(event) => {
                onChange(option.value);
                event.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                });
              }}
            >
              <span>{option.label}</span>
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
        </div>
      </div>
      <p>{description}</p>
    </fieldset>
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
  const selectedQuality = qualityOptions.some((option) => option.value === props.dlpQuality) ? props.dlpQuality as Exclude<DlpQuality, "audio"> : qualityOptions[0]?.value ?? "best";
  const codecOptions = DLP_CODECS.filter((option) => !props.dlpCodecs.length || props.dlpCodecs.includes(option.value));
  const containerOptions = DLP_CONTAINERS.filter((option) => !props.dlpContainers.length || props.dlpContainers.includes(option.value));
  const codecDescription = props.dlpCodec === "h264"
    ? "Most compatible. YouTube H.264 usually ends at 1080p."
    : props.dlpCodec === "av1"
      ? "Best efficiency for high resolution and HDR."
      : props.dlpCodec === "vp9"
        ? "High-resolution quality with broad software support."
        : "Choose the best source codec.";
  const containerDescription = props.dlpContainer === "auto"
    ? "MP4 for H.264, WebM for AV1 or VP9, otherwise source."
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
            <button className="settings-back" type="button" onClick={props.onClose} aria-label="Close settings">
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <h1 id="settings-index-title" tabIndex={-1}>Settings</h1>
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
            <div className="settings-section-heading"><h2 id="settings-title-general" tabIndex={-1}>General</h2></div>
            <div className="settings-list">
              <span className="settings-list-label">Downloads</span>
              <SettingSwitch id="setting-auto-save" label="Save immediately" checked={props.autoSave} onChange={props.onAutoSave} />
              <SettingSwitch id="setting-zip-multiple" label="ZIP multiple files" checked={props.zipMultiple} onChange={props.onZipMultiple} />
            </div>
            <div className="settings-list">
              <span className="settings-list-label">Interface</span>
              <SettingSwitch id="setting-paws" label="Background paws" checked={props.pawsEnabled} onChange={props.onPawsEnabled} />
              <SettingSwitch id="setting-reduce-motion" label="Reduce motion" checked={props.reduceMotion} onChange={props.onReduceMotion} />
            </div>
          </section>

          <section id="settings-panel-private" role="tabpanel" aria-labelledby="settings-tab-private" hidden={props.activeSection !== "private"}>
            <div className="settings-section-heading"><h2 id="settings-title-private" tabIndex={-1}>Private downloads</h2></div>
            <div className="dlp-capability" data-available={props.dlpAvailable}>
              <span aria-hidden="true" />
              <strong>{props.dlpAvailable ? "Isolated downloads available" : "Private downloads unavailable"}</strong>
            </div>
            <div className="settings-private-group">
              <SettingSwitch id="setting-private-mode" label="Private mode for all links" checked={props.privateMode} disabled={!props.dlpAvailable} onChange={props.onPrivateMode} />
              <ChoiceGroup
                label="Video quality"
                description="Unavailable choices fall back to the next best quality."
                options={qualityOptions}
                value={selectedQuality}
                disabled={!props.dlpAvailable}
                className="quality-choice"
                onChange={(value) => props.onDlpQuality(value)}
              />
              <ChoiceGroup label="Preferred video codec" description={codecDescription} options={codecOptions} value={props.dlpCodec} disabled={!props.dlpAvailable || !props.dlpCodecs.length} onChange={props.onDlpCodec} />
              <ChoiceGroup label="File container" description={containerDescription} options={containerOptions} value={props.dlpContainer} disabled={!props.dlpAvailable || !props.dlpContainers.length} onChange={props.onDlpContainer} />
            </div>
          </section>

          <section id="settings-panel-vault" role="tabpanel" aria-labelledby="settings-tab-vault" hidden={props.activeSection !== "vault"}>
            <div className="settings-section-heading"><h2 id="settings-title-vault" tabIndex={-1}>Cookie Vault</h2><p>Encrypted locally. Passphrases cannot be recovered.</p></div>
            <CookieVault ref={vaultRef} selectedProfileId={props.selectedProfileId} onSelectProfile={props.onSelectProfile} onProfiles={props.onProfiles} />
          </section>

          <section id="settings-panel-instance" role="tabpanel" aria-labelledby="settings-tab-instance" hidden={props.activeSection !== "instance"}>
            <div className="settings-section-heading"><h2 id="settings-title-instance" tabIndex={-1}>API instance</h2></div>
            <div className="instance-status"><span aria-hidden="true" /><div><strong>Current connection</strong><small>{props.apiCustom ? "Verified custom Pinchana instance" : "Using the default Pinchana API"}</small></div></div>
            <form className="settings-instance-form" onSubmit={props.onConnectApi}>
              <label htmlFor="api-origin"><strong>Instance origin</strong></label>
              <input id="api-origin" type="url" value={props.apiOrigin} onChange={(event) => props.onApiOrigin(event.target.value)} placeholder="https://api.example.com" spellCheck={false} />
              <div className="instance-actions">
                <button className="secondary" type="button" disabled={props.apiSaving || !props.apiCustom} onClick={props.onUseDefaultApi}>Use default instance</button>
                <button className="primary" type="submit" disabled={props.apiSaving || !props.apiOrigin.trim()}>{props.apiSaving ? "Verifying…" : "Connect"}</button>
              </div>
            </form>
            <p className="instance-note" role="status">{props.apiStatus}</p>
          </section>
        </div>
      </div>
    </section>
  );
});

export default SettingsView;
