"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import {useTranslations} from "next-intl";
import {
  changeVaultPassphrase,
  CookieProfile,
  cookiesForUrl,
  createVault,
  eraseVault,
  parseNetscapeCookies,
  profileDomains,
  saveVault,
  unlockVault,
  vaultExists,
  VaultPayload,
} from "@/lib/cookie-vault";

export type VaultProfileSummary = { id: string; label: string; domains: string[] };
export type CookieVaultHandle = {
  selectedCookiesForUrl: (profileId: string, url: string) => Uint8Array<ArrayBuffer>;
  unlocked: () => boolean;
};

type Props = {
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  onProfiles: (profiles: VaultProfileSummary[], unlocked: boolean) => void;
  accentCookies?: boolean;
  onAccentCookiesReset?: () => void;
};

type DestructiveAction =
  | { kind: "profile"; profile: CookieProfile }
  | { kind: "vault" };

const CookieVault = forwardRef<CookieVaultHandle, Props>(function CookieVault(
  { selectedProfileId, onSelectProfile, onProfiles, accentCookies, onAccentCookiesReset },
  ref,
) {
  const t = useTranslations("vault");
  const [exists, setExists] = useState(false);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [payload, setPayload] = useState<VaultPayload | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [profileName, setProfileName] = useState("");
  const [pastedCookies, setPastedCookies] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const destructiveDialogRef = useRef<HTMLDialogElement>(null);
  const cancelDestructiveRef = useRef<HTMLButtonElement>(null);

  const publish = (next: VaultPayload | null, unlocked = Boolean(next)) => {
    onProfiles(next?.profiles.map((profile) => ({ id: profile.id, label: profile.label, domains: profileDomains(profile) })) ?? [], unlocked);
  };

  useEffect(() => {
    void vaultExists().then(setExists).catch(() => toast.error(t("storageUnavailable")));
  }, [t]);

  useEffect(() => {
    if (!accentCookies) return;
    const focusTimer = window.setTimeout(() => {
      passphraseInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      passphraseInputRef.current?.focus();
      onAccentCookiesReset?.();
    }, 100);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [accentCookies, onAccentCookiesReset]);

  useEffect(() => publish(payload), [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!destructiveAction) return;
    const dialog = destructiveDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    cancelDestructiveRef.current?.focus();
  }, [destructiveAction]);

  useImperativeHandle(ref, () => ({
    selectedCookiesForUrl(profileId: string, url: string) {
      const profile = payload?.profiles.find((candidate) => candidate.id === profileId);
      if (!profile) throw new Error(t("unlockAndSelect"));
      return cookiesForUrl(profile, url);
    },
    unlocked: () => Boolean(key && payload),
  }), [key, payload, t]);

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : t("operationFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    await guarded(async () => {
      const unlocked = await createVault(passphrase);
      setKey(unlocked.key);
      setPayload(unlocked.payload);
      setExists(true);
      setPassphrase("");
      toast.success(t("created"));
    });
  }

  async function unlock() {
    await guarded(async () => {
      const unlocked = await unlockVault(passphrase);
      setKey(unlocked.key);
      setPayload(unlocked.payload);
      setPassphrase("");
      toast.success(t("unlocked"));
    });
  }

  function lock() {
    setKey(null);
    setPayload(null);
    onSelectProfile("");
    publish(null, false);
    toast.success(t("locked"));
  }

  async function importProfile(bytes: Uint8Array) {
    try {
      if (!key || !payload) throw new Error(t("unlockFirst"));
      const profile = parseNetscapeCookies(bytes, profileName);
      const replaceIndex = selectedProfileId ? payload.profiles.findIndex((item) => item.id === selectedProfileId) : -1;
      const profiles = [...payload.profiles];
      if (replaceIndex >= 0) {
        const previous = profiles[replaceIndex];
        profiles[replaceIndex] = { ...profile, id: previous.id, createdAt: previous.createdAt };
      } else {
        profiles.push(profile);
      }
      const next = { ...payload, profiles } as VaultPayload;
      await saveVault(key, next);
      setPayload(next);
      onSelectProfile(replaceIndex >= 0 ? profiles[replaceIndex].id : profile.id);
      setProfileName("");
      toast.success(replaceIndex >= 0 ? t("profileReplaced") : t("profileImported"));
    } finally {
      bytes.fill(0);
      setPastedCookies("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeProfile(profile: CookieProfile) {
    if (!key || !payload) return;
    await guarded(async () => {
      const next = { ...payload, profiles: payload.profiles.filter((item) => item.id !== profile.id) } as VaultPayload;
      await saveVault(key, next);
      setPayload(next);
      if (selectedProfileId === profile.id) onSelectProfile("");
      toast.success(t("profileDeleted"));
    });
  }

  async function removeVault() {
    await guarded(async () => {
      await eraseVault();
      setKey(null);
      setPayload(null);
      setExists(false);
      setPassphrase("");
      onSelectProfile("");
      publish(null, false);
      toast.success(t("erased"));
    });
  }

  async function confirmDestructiveAction() {
    const action = destructiveAction;
    if (!action) return;
    destructiveDialogRef.current?.close();
    if (action.kind === "profile") await removeProfile(action.profile);
    else await removeVault();
  }

  return (
    <div className="vault-panel">
      {!key || !payload ? (
        <div className="vault-auth">
          <div className="vault-section-title">
            <h3>{exists ? t("lockedTitle") : t("setupTitle")}</h3>
            <p>{exists ? t("unlockDescription") : t("setupDescription")}</p>
          </div>
          <label>
            <span>{t("passphrase")}</span>
            <input
              ref={passphraseInputRef}
              type="password"
              value={passphrase}
              autoComplete={exists ? "current-password" : "new-password"}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <div className="vault-actions">
            {exists ? <button className="vault-button danger" type="button" disabled={busy} onClick={() => setDestructiveAction({ kind: "vault" })}>{t("erase")}</button> : null}
            <button className="vault-button primary" type="button" disabled={busy || passphrase.length < 10} onClick={() => void (exists ? unlock() : create())}>
              {busy ? t("working") : exists ? t("unlock") : t("create")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="vault-toolbar">
            <div><strong>{t("profiles")}</strong><small>{t("saved", {count: payload.profiles.length})}</small></div>
            <button className="vault-button quiet" type="button" onClick={lock}>{t("lockNow")}</button>
          </div>

          <div className="vault-profiles">
            {payload.profiles.length === 0 ? <div className="vault-empty"><p>{t("empty")}</p><small>{t("emptyDescription")}</small></div> : null}
            {payload.profiles.map((profile) => (
              <article key={profile.id} data-selected={profile.id === selectedProfileId}>
                <button type="button" className="profile-select" aria-pressed={profile.id === selectedProfileId} onClick={() => onSelectProfile(profile.id)}>
                  <span className="vault-profile-state" aria-hidden="true" />
                  <span><strong>{profile.label}</strong><small>{profileDomains(profile).join(", ")}</small></span>
                </button>
                <button type="button" className="vault-profile-delete" aria-label={t("deleteNamed", {name: profile.label})} onClick={() => setDestructiveAction({ kind: "profile", profile })}>{t("delete")}</button>
              </article>
            ))}
          </div>

          <section className="vault-import" aria-labelledby="vault-import-title">
            <div className="vault-section-title">
              <h3 id="vault-import-title">{selectedProfileId ? t("replaceProfile") : t("addProfile")}</h3>
              {selectedProfileId ? <button className="vault-text-action" type="button" onClick={() => onSelectProfile("")}>{t("addNew")}</button> : null}
            </div>
            <label>
              <span>{t("profileName")}</span>
              <input value={profileName} maxLength={80} placeholder={t("profilePlaceholder")} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <div className="vault-import-methods">
              <label className="vault-file-picker">
                <input
                  ref={fileRef}
                  className="sr-only"
                  aria-label={t("chooseFile")}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void guarded(async () => importProfile(new Uint8Array(await file.arrayBuffer())));
                  }}
                />
                {t("chooseFile")}
              </label>
              <span>{t("pasteSeparator")}</span>
            </div>
            <label>
              <span>{t("pasteLabel")}</span>
              <textarea value={pastedCookies} spellCheck={false} placeholder="# Netscape HTTP Cookie File" onChange={(event) => setPastedCookies(event.target.value)} />
            </label>
            <div className="vault-actions">
              <button className="vault-button primary" type="button" disabled={busy || !profileName.trim() || !pastedCookies.trim()} onClick={() => void guarded(async () => { const bytes = new TextEncoder().encode(pastedCookies); await importProfile(bytes); })}>{t("importPasted")}</button>
            </div>
          </section>

          <section className="vault-passphrase-change" aria-labelledby="vault-passphrase-title">
            <div className="vault-section-title"><h3 id="vault-passphrase-title">{t("changePassphrase")}</h3></div>
            <label><span>{t("currentPassphrase")}</span><input type="password" autoComplete="current-password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.target.value)} /></label>
            <label><span>{t("newPassphrase")}</span><input type="password" autoComplete="new-password" value={nextPassphrase} onChange={(event) => setNextPassphrase(event.target.value)} /></label>
            <div className="vault-actions">
              <button className="vault-button secondary" type="button" disabled={busy || nextPassphrase.length < 10} onClick={() => void guarded(async () => { const changed = await changeVaultPassphrase(currentPassphrase, nextPassphrase); setKey(changed.key); setPayload(changed.payload); setCurrentPassphrase(""); setNextPassphrase(""); toast.success(t("passphraseChanged")); })}>{t("updatePassphrase")}</button>
            </div>
          </section>

          <div className="vault-danger-zone">
            <div><strong>{t("eraseTitle")}</strong><small>{t("eraseDescription")}</small></div>
            <button className="vault-button danger" type="button" onClick={() => setDestructiveAction({ kind: "vault" })}>{t("erase")}</button>
          </div>
        </>
      )}

      {destructiveAction ? (
        <dialog
          ref={destructiveDialogRef}
          className="vault-confirm-dialog"
          role="alertdialog"
          aria-labelledby="vault-confirm-title"
          aria-describedby="vault-confirm-description"
          onCancel={(event) => { event.preventDefault(); destructiveDialogRef.current?.close(); }}
          onClose={() => setDestructiveAction(null)}
        >
          <h3 id="vault-confirm-title">{destructiveAction.kind === "profile" ? t("deleteConfirm", {name: destructiveAction.profile.label}) : t("eraseConfirm")}</h3>
          <p id="vault-confirm-description">
            {destructiveAction.kind === "profile"
              ? t("deleteDescription")
              : t("eraseConfirmDescription")}
          </p>
          <div className="vault-confirm-actions">
            <button ref={cancelDestructiveRef} className="vault-button secondary" type="button" onClick={() => destructiveDialogRef.current?.close()}>{t("cancel")}</button>
            <button className="vault-button danger-solid" type="button" disabled={busy} onClick={() => void confirmDestructiveAction()}>{destructiveAction.kind === "profile" ? t("deleteProfile") : t("erase")}</button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
});

export default CookieVault;
