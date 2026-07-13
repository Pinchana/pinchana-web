"use client";

export const VAULT_VERSION = 1;
export const MIN_PBKDF2_ITERATIONS = 600_000;
export const MAX_COOKIE_FILE_BYTES = 256 * 1024;

const DB_NAME = "pinchana-cookie-vault";
const DB_VERSION = 1;
const STORE = "vault";
const RECORD_ID = "primary";

export type VaultCookie = {
  domain: string;
  includeSubdomains: boolean;
  path: string;
  secure: boolean;
  expires: number;
  name: string;
  value: string;
  httpOnly: boolean;
};

export type CookieProfile = {
  id: string;
  label: string;
  cookies: VaultCookie[];
  createdAt: number;
  updatedAt: number;
};

export type VaultPayload = { version: 1; profiles: CookieProfile[] };

type VaultRecord = {
  id: typeof RECORD_ID;
  version: 1;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Cookie Vault storage is unavailable."));
  });
}

async function readRecord(): Promise<VaultRecord | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_ID);
      request.onsuccess = () => resolve((request.result as VaultRecord | undefined) ?? null);
      request.onerror = () => reject(new Error("Cookie Vault could not be read."));
    });
  } finally {
    database.close();
  }
}

async function writeRecord(record: VaultRecord): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Cookie Vault could not be saved."));
    });
  } finally {
    database.close();
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (passphrase.length < 10) throw new Error("Use a passphrase with at least 10 characters.");
  const passphraseBytes = encoder.encode(passphrase);
  try {
    const material = await crypto.subtle.importKey("raw", passphraseBytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    passphraseBytes.fill(0);
  }
}

export async function calibratedIterations(): Promise<number> {
  const sample = 50_000;
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const started = performance.now();
  await deriveKey("pinchana-calibration-only", salt, sample);
  const elapsed = Math.max(1, performance.now() - started);
  salt.fill(0);
  return Math.max(MIN_PBKDF2_ITERATIONS, Math.min(2_000_000, Math.ceil((sample * 250) / elapsed / 10_000) * 10_000));
}

async function encryptPayload(key: CryptoKey, payload: VaultPayload, metadata: Omit<VaultRecord, "id" | "iv" | "ciphertext">): Promise<VaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(`pinchana-vault:v${metadata.version}`) },
      key,
      plaintext,
    );
    return { id: RECORD_ID, ...metadata, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  } finally {
    plaintext.fill(0);
    iv.fill(0);
  }
}

export async function vaultExists(): Promise<boolean> {
  return (await readRecord()) !== null;
}

export async function createVault(passphrase: string): Promise<{ key: CryptoKey; payload: VaultPayload }> {
  if (await vaultExists()) throw new Error("A Cookie Vault already exists on this device.");
  const iterations = await calibratedIterations();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(passphrase, salt, iterations);
  const payload: VaultPayload = { version: VAULT_VERSION, profiles: [] };
  await writeRecord(await encryptPayload(key, payload, { version: VAULT_VERSION, salt: bytesToBase64(salt), iterations }));
  salt.fill(0);
  return { key, payload };
}

export async function unlockVault(passphrase: string): Promise<{ key: CryptoKey; payload: VaultPayload }> {
  const record = await readRecord();
  if (!record || record.version !== VAULT_VERSION || record.iterations < MIN_PBKDF2_ITERATIONS) {
    throw new Error("No supported Cookie Vault exists on this device.");
  }
  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  try {
    const key = await deriveKey(passphrase, salt, record.iterations);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(`pinchana-vault:v${record.version}`) },
      key,
      base64ToBytes(record.ciphertext),
    ));
    try {
      const payload = JSON.parse(decoder.decode(plaintext)) as VaultPayload;
      if (payload.version !== VAULT_VERSION || !Array.isArray(payload.profiles)) throw new Error();
      return { key, payload };
    } finally {
      plaintext.fill(0);
    }
  } catch {
    throw new Error("The passphrase is incorrect or the Cookie Vault is damaged.");
  } finally {
    salt.fill(0);
    iv.fill(0);
  }
}

export async function saveVault(key: CryptoKey, payload: VaultPayload): Promise<void> {
  const record = await readRecord();
  if (!record) throw new Error("Cookie Vault no longer exists.");
  await writeRecord(await encryptPayload(key, payload, {
    version: VAULT_VERSION,
    salt: record.salt,
    iterations: record.iterations,
  }));
}

export async function changeVaultPassphrase(currentPassphrase: string, nextPassphrase: string): Promise<{ key: CryptoKey; payload: VaultPayload }> {
  const { payload } = await unlockVault(currentPassphrase);
  const iterations = await calibratedIterations();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(nextPassphrase, salt, iterations);
  await writeRecord(await encryptPayload(key, payload, { version: VAULT_VERSION, salt: bytesToBase64(salt), iterations }));
  salt.fill(0);
  return { key, payload };
}

export async function eraseVault(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(RECORD_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Cookie Vault could not be erased."));
    });
  } finally {
    database.close();
  }
}

function normalizedDomain(value: string): string {
  return value.replace(/^#HttpOnly_/, "").replace(/^\./, "").toLowerCase();
}

export function parseNetscapeCookies(bytes: Uint8Array, label: string): CookieProfile {
  if (bytes.byteLength > MAX_COOKIE_FILE_BYTES) throw new Error("Cookie file is larger than 256 KiB.");
  let text: string;
  try { text = decoder.decode(bytes); } catch { throw new Error("Cookie file must be valid UTF-8."); }
  const cookies: VaultCookie[] = [];
  const currentTime = Math.floor(Date.now() / 1000);
  for (const sourceLine of text.split(/\r?\n/)) {
    if (!sourceLine || (sourceLine.startsWith("#") && !sourceLine.startsWith("#HttpOnly_"))) continue;
    const httpOnly = sourceLine.startsWith("#HttpOnly_");
    const fields = sourceLine.split("\t");
    if (fields.length !== 7) throw new Error("Cookie file is not in Netscape cookies.txt format.");
    const [rawDomain, include, path, secure, expiryText, name, value] = fields;
    const domain = normalizedDomain(rawDomain);
    const expires = Number(expiryText);
    if (!domain.includes(".") || /[^a-z0-9.-]/.test(domain) || !path.startsWith("/")) throw new Error("Cookie file contains an invalid domain or path.");
    if (!Number.isSafeInteger(expires) || expires < 0 || !["TRUE", "FALSE"].includes(include) || !["TRUE", "FALSE"].includes(secure)) {
      throw new Error("Cookie file contains an invalid Netscape row.");
    }
    if (expires !== 0 && expires <= currentTime) continue;
    cookies.push({ domain, includeSubdomains: include === "TRUE", path, secure: secure === "TRUE", expires, name, value, httpOnly });
  }
  if (!cookies.length) throw new Error("Cookie file contains no unexpired cookies.");
  const cleanLabel = label.trim();
  if (!cleanLabel || cleanLabel.length > 80) throw new Error("Profile name must be between 1 and 80 characters.");
  const timestamp = Date.now();
  return { id: crypto.randomUUID(), label: cleanLabel, cookies, createdAt: timestamp, updatedAt: timestamp };
}

export function profileDomains(profile: CookieProfile): string[] {
  return [...new Set(profile.cookies.map((cookie) => cookie.domain))].sort();
}

export function cookiesForUrl(profile: CookieProfile, value: string): Uint8Array<ArrayBuffer> {
  const hostname = new URL(value).hostname.toLowerCase();
  const currentTime = Math.floor(Date.now() / 1000);
  const cookies = profile.cookies.filter((cookie) =>
    (cookie.expires === 0 || cookie.expires > currentTime)
    && (hostname === cookie.domain || (cookie.includeSubdomains && hostname.endsWith(`.${cookie.domain}`))),
  );
  if (!cookies.length) throw new Error(`The selected profile has no cookies for ${hostname}.`);
  const lines = ["# Netscape HTTP Cookie File", ...cookies.map((cookie) => {
    const domain = `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.includeSubdomains ? "." : ""}${cookie.domain}`;
    return [domain, cookie.includeSubdomains ? "TRUE" : "FALSE", cookie.path, cookie.secure ? "TRUE" : "FALSE", cookie.expires, cookie.name, cookie.value].join("\t");
  })];
  return encoder.encode(`${lines.join("\n")}\n`);
}
