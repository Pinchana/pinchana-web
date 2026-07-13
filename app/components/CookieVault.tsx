"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
  open: boolean;
  onClose: () => void;
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  onProfiles: (profiles: VaultProfileSummary[], unlocked: boolean) => void;
};

const CookieVault = forwardRef<CookieVaultHandle, Props>(function CookieVault(
  { open, onClose, selectedProfileId, onSelectProfile, onProfiles },
  ref,
) {
  const [exists, setExists] = useState(false);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [payload, setPayload] = useState<VaultPayload | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [profileName, setProfileName] = useState("");
  const [pastedCookies, setPastedCookies] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const publish = (next: VaultPayload | null, unlocked = Boolean(next)) => {
    onProfiles(next?.profiles.map((profile) => ({ id: profile.id, label: profile.label, domains: profileDomains(profile) })) ?? [], unlocked);
  };

  useEffect(() => {
    void vaultExists().then(setExists).catch(() => setMessage("Cookie Vault storage is unavailable."));
  }, []);

  useEffect(() => publish(payload), [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    selectedCookiesForUrl(profileId: string, url: string) {
      const profile = payload?.profiles.find((candidate) => candidate.id === profileId);
      if (!profile) throw new Error("Unlock the Cookie Vault and select a cookie profile.");
      return cookiesForUrl(profile, url);
    },
    unlocked: () => Boolean(key && payload),
  }), [key, payload]);

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try { await action(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Cookie Vault operation failed."); }
    finally { setBusy(false); }
  }

  async function create() {
    await guarded(async () => {
      const unlocked = await createVault(passphrase);
      setKey(unlocked.key); setPayload(unlocked.payload); setExists(true); setPassphrase("");
      setMessage("Cookie Vault created and unlocked.");
    });
  }

  async function unlock() {
    await guarded(async () => {
      const unlocked = await unlockVault(passphrase);
      setKey(unlocked.key); setPayload(unlocked.payload); setPassphrase("");
      setMessage("Cookie Vault unlocked for this browser session.");
    });
  }

  function lock() {
    setKey(null); setPayload(null); onSelectProfile(""); publish(null, false); setMessage("Cookie Vault locked.");
  }

  async function importProfile(bytes: Uint8Array) {
    try {
      if (!key || !payload) throw new Error("Unlock the Cookie Vault first.");
      const profile = parseNetscapeCookies(bytes, profileName);
      const replaceIndex = selectedProfileId ? payload.profiles.findIndex((item) => item.id === selectedProfileId) : -1;
      const profiles = [...payload.profiles];
      if (replaceIndex >= 0) {
        const previous = profiles[replaceIndex];
        profiles[replaceIndex] = { ...profile, id: previous.id, createdAt: previous.createdAt };
      } else profiles.push(profile);
      const next = { ...payload, profiles } as VaultPayload;
      await saveVault(key, next);
      setPayload(next); onSelectProfile(replaceIndex >= 0 ? profiles[replaceIndex].id : profile.id);
      setProfileName("");
      setMessage(replaceIndex >= 0 ? "Cookie profile replaced." : "Cookie profile imported.");
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
      await saveVault(key, next); setPayload(next);
      if (selectedProfileId === profile.id) onSelectProfile("");
      setMessage("Cookie profile deleted.");
    });
  }

  if (!open) return null;
  return (
    <div className="vault-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-title">
        <header><div><h2 id="vault-title">Cookie Vault</h2><p>Encrypted on this device. The passphrase cannot be recovered.</p></div><button type="button" onClick={onClose} aria-label="Close Cookie Vault">×</button></header>
        {!key || !payload ? (
          <div className="vault-auth">
            <label>Vault passphrase<input type="password" value={passphrase} autoComplete={exists ? "current-password" : "new-password"} onChange={(event) => setPassphrase(event.target.value)} /></label>
            <button type="button" disabled={busy || passphrase.length < 10} onClick={() => void (exists ? unlock() : create())}>{busy ? "Working…" : exists ? "Unlock vault" : "Create vault"}</button>
            {exists && <button className="secondary" type="button" disabled={busy} onClick={() => void guarded(async () => { if (!confirm("Erase the encrypted Cookie Vault from this browser?")) return; await eraseVault(); setExists(false); setPassphrase(""); publish(null, false); setMessage("Cookie Vault erased."); })}>Erase vault</button>}
          </div>
        ) : (
          <>
            <div className="vault-toolbar"><strong>{payload.profiles.length} profile{payload.profiles.length === 1 ? "" : "s"}</strong><button type="button" onClick={lock}>Lock now</button></div>
            <div className="vault-profiles">
              {payload.profiles.length === 0 && <p>No cookie profiles yet.</p>}
              {payload.profiles.map((profile) => <article key={profile.id} data-selected={profile.id === selectedProfileId}>
                <button type="button" className="profile-select" onClick={() => onSelectProfile(profile.id)}><strong>{profile.label}</strong><small>{profileDomains(profile).join(", ")}</small></button>
                <button type="button" className="danger" onClick={() => void removeProfile(profile)}>Delete</button>
              </article>)}
            </div>
            <div className="vault-import">
              <h3>{selectedProfileId ? "Replace selected profile" : "Import profile"}</h3>
              <label>Profile name<input value={profileName} maxLength={80} onChange={(event) => setProfileName(event.target.value)} /></label>
              <label>Choose cookies.txt<input ref={fileRef} type="file" accept=".txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void guarded(async () => importProfile(new Uint8Array(await file.arrayBuffer()))); }} /></label>
              <label>Or paste Netscape cookies.txt<textarea value={pastedCookies} spellCheck={false} onChange={(event) => setPastedCookies(event.target.value)} /></label>
              <button type="button" disabled={busy || !profileName.trim() || !pastedCookies.trim()} onClick={() => void guarded(async () => { const bytes = new TextEncoder().encode(pastedCookies); await importProfile(bytes); })}>Import pasted cookies</button>
              {selectedProfileId && <button className="secondary" type="button" onClick={() => onSelectProfile("")}>Import as new instead</button>}
            </div>
            <div className="vault-passphrase-change"><h3>Change passphrase</h3><input type="password" placeholder="Current passphrase" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.target.value)} /><input type="password" placeholder="New passphrase" value={nextPassphrase} onChange={(event) => setNextPassphrase(event.target.value)} /><button type="button" disabled={busy || nextPassphrase.length < 10} onClick={() => void guarded(async () => { const changed = await changeVaultPassphrase(currentPassphrase, nextPassphrase); setKey(changed.key); setPayload(changed.payload); setCurrentPassphrase(""); setNextPassphrase(""); setMessage("Vault passphrase changed."); })}>Change passphrase</button></div>
            <button className="vault-erase danger" type="button" onClick={() => void guarded(async () => { if (!confirm("Permanently erase this Cookie Vault?")) return; await eraseVault(); setKey(null); setPayload(null); setExists(false); onSelectProfile(""); publish(null, false); })}>Erase vault</button>
          </>
        )}
        {message && <p className="vault-message" role="status">{message}</p>}
      </section>
    </div>
  );
});

export default CookieVault;
