"use client";

import { x25519 } from "@noble/curves/ed25519.js";

export type DlpAllocation = { jobId: string; keyId: string; workerPubKey: string; expiresAt: number };
export type DlpEnvelope = {
  version: 2;
  keyId: string;
  clientPubKey: string;
  salt: string;
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function nativeSharedSecret(workerPublic: Uint8Array<ArrayBuffer>): Promise<{ publicKey: Uint8Array<ArrayBuffer>; secret: ArrayBuffer } | null> {
  try {
    const algorithm = { name: "X25519" } as Algorithm;
    const pair = await crypto.subtle.generateKey(algorithm, true, ["deriveBits"]);
    if (!("privateKey" in pair)) return null;
    const workerKey = await crypto.subtle.importKey("raw", workerPublic, algorithm, false, []);
    const secret = await crypto.subtle.deriveBits({ name: "X25519", public: workerKey } as EcdhKeyDeriveParams, pair.privateKey, 256);
    return { publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)), secret };
  } catch {
    return null;
  }
}

export async function encryptCookiesForJob(allocation: DlpAllocation, plaintext: Uint8Array<ArrayBuffer>): Promise<DlpEnvelope> {
  const workerPublic = decodeBase64(allocation.workerPubKey);
  if (workerPublic.byteLength !== 32) throw new Error("The DLP worker returned an invalid public key.");
  const native = await nativeSharedSecret(workerPublic);
  let clientPublic: Uint8Array<ArrayBuffer>;
  let shared: Uint8Array<ArrayBuffer>;
  let fallbackPrivate: Uint8Array | null = null;
  if (native) {
    clientPublic = native.publicKey;
    shared = new Uint8Array(native.secret);
  } else {
    const pair = x25519.keygen();
    fallbackPrivate = pair.secretKey;
    clientPublic = Uint8Array.from(pair.publicKey);
    shared = Uint8Array.from(x25519.getSharedSecret(pair.secretKey, workerPublic));
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const keyMaterial = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(`pinchana-dlp/cookies/v2/${allocation.jobId}/${allocation.keyId}`) },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(`pinchana-dlp:v2:${allocation.jobId}:${allocation.keyId}`) },
      key,
      plaintext,
    );
    return {
      version: 2,
      keyId: allocation.keyId,
      clientPubKey: encodeBase64(clientPublic),
      salt: encodeBase64(salt),
      iv: encodeBase64(iv),
      ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    };
  } finally {
    shared.fill(0);
    fallbackPrivate?.fill(0);
    salt.fill(0);
    iv.fill(0);
  }
}
