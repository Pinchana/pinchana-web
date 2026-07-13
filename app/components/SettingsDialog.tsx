"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faKey, faServer, faShieldHalved, faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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
  onSectionChange: (section: SettingsSection) => void;
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
  { id: "general" as const, label: "General", detail: "Downloads and appearance", icon: faSliders },
  { id: "private" as const, label: "Private downloads", detail: "Quality and formats", icon: faShieldHalved },
  { id: "vault" as const, label: "Cookie Vault", detail: "Encrypted profiles", icon: faKey },
  { id: "instance" as const, label: "API instance", detail: "Connection and trust", icon: faServer },
];

function SettingSwitch({ id, label, detail, checked, disabled = false, onChange }: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-switch-row" htmlFor={id} data-disabled={disabled}>
      <span><strong>{label}</strong><small>{detail}</small></span>
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
  return (
    <fieldset className={`settings-choice-group ${className}`} disabled={disabled}>
      <legend>{label}</legend>
      <div className="settings-segments" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-label={option.detail ? `${option.label} + ${option.detail}` : option.label}
            aria-checked={value === option.value}
            data-selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.detail && <small>{option.detail}</small>}
          </button>
        ))}
      </div>
      <p>{description}</p>
    </fieldset>
  );
}

const SettingsDialog = forwardRef<CookieVaultHandle, Props>(function SettingsDialog(props, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const vaultRef = useRef<CookieVaultHandle>(null);

  useImperativeHandle(ref, () => ({
    selectedCookiesForUrl(profileId: string, url: string) {
      if (!vaultRef.current) throw new Error("Cookie Vault is unavailable.");
      return vaultRef.current.selectedCookiesForUrl(profileId, url);
    },
    unlocked: () => vaultRef.current?.unlocked() ?? false,
  }), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
    document.documentElement.classList.toggle("settings-open", props.open);
    return () => document.documentElement.classList.remove("settings-open");
  }, [props.open]);

  const qualityOptions = DLP_VIDEO_QUALITIES.filter((option) => !props.dlpQualities.length || props.dlpQualities.includes(option.value));
  const selectedQuality = qualityOptions.some((option) => option.value === props.dlpQuality) ? props.dlpQuality as Exclude<DlpQuality, "audio"> : qualityOptions[0]?.value ?? "best";
  const codecOptions = DLP_CODECS.filter((option) => !props.dlpCodecs.length || props.dlpCodecs.includes(option.value));
  const containerOptions = DLP_CONTAINERS.filter((option) => !props.dlpContainers.length || props.dlpContainers.includes(option.value));
  const codecDescription = props.dlpCodec === "h264"
    ? "Best compatibility. YouTube H.264 usually tops out at 1080p before fallback."
    : props.dlpCodec === "av1"
      ? "Best efficiency for high-resolution and HDR video when available."
      : props.dlpCodec === "vp9"
        ? "Strong high-resolution quality with broad software-player support."
        : "Choose the best source codec automatically.";
  const containerDescription = props.dlpContainer === "auto"
    ? "MP4 for H.264, WebM for AV1 or VP9, otherwise the source container."
    : `Remux the completed video to ${props.dlpContainer.toUpperCase()} without transcoding.`;

  function navigateSections(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const nextIndex = (index + direction + sections.length) % sections.length;
    props.onSectionChange(sections[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${sections[nextIndex].id}`)?.focus());
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); props.onClose(); }}
      onClose={() => { if (props.open) props.onClose(); }}
      onMouseDown={(event) => { if (event.target === dialogRef.current) props.onClose(); }}
    >
      <div className="settings-window" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">Preferences</span>
            <h2 id="settings-title">Settings</h2>
            <p>Everything here stays in this browser.</p>
          </div>
          <button className="settings-close" type="button" onClick={props.onClose} aria-label="Close settings" autoFocus>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        <div className="settings-layout">
          <nav className="settings-navigation" aria-label="Settings sections" role="tablist">
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
                onClick={() => props.onSectionChange(section.id)}
                onKeyDown={(event) => navigateSections(event, index)}
              >
                <FontAwesomeIcon icon={section.icon} />
                <span><strong>{section.label}</strong><small>{section.detail}</small></span>
              </button>
            ))}
            <div className="settings-saved"><span aria-hidden="true" />Saved on this device</div>
          </nav>

          <div className="settings-content">
            <section id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={props.activeSection !== "general"}>
              <div className="settings-section-heading"><FontAwesomeIcon icon={faDownload} /><div><h3>General</h3><p>Choose how downloads behave and how Pinchana feels.</p></div></div>
              <div className="settings-group">
                <div className="settings-group-heading"><strong>Download behavior</strong><small>Applied to ordinary and private downloads.</small></div>
                <SettingSwitch id="setting-auto-save" label="Save immediately" detail="Start the browser download as soon as processing completes." checked={props.autoSave} onChange={props.onAutoSave} />
                <SettingSwitch id="setting-zip-multiple" label="ZIP multiple files" detail="Combine carousels and track lists into one archive." checked={props.zipMultiple} onChange={props.onZipMultiple} />
              </div>
              <div className="settings-group">
                <div className="settings-group-heading"><strong>Appearance and motion</strong><small>Local interface preferences.</small></div>
                <SettingSwitch id="setting-paws" label="Background paws" detail="Show the subtle floating paw pattern." checked={props.pawsEnabled} onChange={props.onPawsEnabled} />
                <SettingSwitch id="setting-reduce-motion" label="Reduce motion" detail="Disable interface animations and transitions." checked={props.reduceMotion} onChange={props.onReduceMotion} />
              </div>
            </section>

            <section id="settings-panel-private" role="tabpanel" aria-labelledby="settings-tab-private" hidden={props.activeSection !== "private"}>
              <div className="settings-section-heading"><FontAwesomeIcon icon={faShieldHalved} /><div><h3>Private downloads</h3><p>Control isolated-worker downloads without exposing raw yt-dlp options.</p></div></div>
              <div className="dlp-capability" data-available={props.dlpAvailable}>
                <span aria-hidden="true" />
                <div><strong>{props.dlpAvailable ? "DLP protocol v2 available" : "Private downloads unavailable"}</strong><small>{props.dlpAvailable ? "YouTube always uses an isolated worker. Other links use one when Private mode is enabled." : "The selected API instance does not advertise DLP support."}</small></div>
              </div>
              <div className="settings-group settings-private-group">
                <SettingSwitch id="setting-private-mode" label="Private mode" detail="Use an isolated DLP worker for non-YouTube links." checked={props.privateMode} disabled={!props.dlpAvailable} onChange={props.onPrivateMode} />
                <ChoiceGroup
                  label="Video quality"
                  description="If the selected ceiling is unavailable, the next best quality is used."
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
              <div className="settings-section-heading"><FontAwesomeIcon icon={faKey} /><div><h3>Cookie Vault</h3><p>Encrypted on this device. Your passphrase cannot be recovered.</p></div></div>
              <CookieVault
                ref={vaultRef}
                selectedProfileId={props.selectedProfileId}
                onSelectProfile={props.onSelectProfile}
                onProfiles={props.onProfiles}
              />
            </section>

            <section id="settings-panel-instance" role="tabpanel" aria-labelledby="settings-tab-instance" hidden={props.activeSection !== "instance"}>
              <div className="settings-section-heading"><FontAwesomeIcon icon={faServer} /><div><h3>API instance</h3><p>Connect only to a signed Pinchana instance you trust.</p></div></div>
              <div className="instance-status"><span aria-hidden="true" /><div><strong>Current connection</strong><small>{props.apiCustom ? "Verified custom Pinchana instance" : "Using the default Pinchana API"}</small></div></div>
              <form className="settings-instance-form" onSubmit={props.onConnectApi}>
                <label htmlFor="api-origin"><strong>Instance origin</strong><small>Enter only the origin, without an API path.</small></label>
                <input id="api-origin" type="url" value={props.apiOrigin} onChange={(event) => props.onApiOrigin(event.target.value)} placeholder="https://api.example.com" spellCheck={false} />
                <div className="instance-actions">
                  <button className="secondary" type="button" disabled={props.apiSaving || !props.apiCustom} onClick={props.onUseDefaultApi}>Use default instance</button>
                  <button className="primary" type="submit" disabled={props.apiSaving || !props.apiOrigin.trim()}>{props.apiSaving ? "Verifying…" : "Connect"}</button>
                </div>
              </form>
              <p className="instance-note" role="status">{props.apiStatus}</p>
              <p className="instance-note">Changing instances refreshes verification and available private-download capabilities.</p>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  );
});

export default SettingsDialog;
