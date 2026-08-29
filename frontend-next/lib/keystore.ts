// Keystore KDFs — ported from Frontend/app.js (Canopy official formats).
import { b2h, h2b } from "@/lib/format";

type BS = BufferSource;
const bs = (x: Uint8Array | Uint8Array<ArrayBufferLike>): BS => x as unknown as BS;

declare global {
  interface Window {
    argon2?: {
      hash: (opts: {
        pass: string | Uint8Array;
        salt: Uint8Array;
        time: number;
        mem: number;
        hashLen: number;
        parallelism: number;
        type: number;
      }) => Promise<{ hash: Uint8Array }>;
      ArgonType: { Argon2d: number; Argon2i: number; Argon2id: number };
    };
  }
}

export const ARGON2_TIME = 3;
export const ARGON2_MEM = 65536; // 64 MB
export const ARGON2_THREADS = 4;
export const ARGON2_KEYLEN = 32;

export function argon2Available(): boolean {
  return typeof window !== "undefined" && !!window.argon2;
}

async function deriveKeyArgon2id(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!window.argon2) {
    throw new Error("Argon2 library not loaded — /argon2-bundled.min.js missing");
  }
  const result = await window.argon2.hash({
    pass: password,
    salt,
    time: ARGON2_TIME,
    mem: ARGON2_MEM,
    hashLen: ARGON2_KEYLEN,
    parallelism: ARGON2_THREADS,
    type: window.argon2.ArgonType.Argon2id,
  });
  return crypto.subtle.importKey("raw", bs(result.hash), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export interface LegacyKeystore {
  kdf: string;
  salt: string;
  iv: string;
  encrypted: string;
  argon2?: { time: number; mem: number; threads: number; keylen: number };
}

// Export in the Canopy-official argon2id JSON format (legacy parity).
export async function encryptKeystore(privKeyBytes: Uint8Array, password: string): Promise<LegacyKeystore> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyArgon2id(password, salt);
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bs(privKeyBytes));
  return {
    kdf: "argon2id",
    salt: b2h(salt),
    iv: b2h(iv),
    encrypted: b2h(new Uint8Array(enc)),
    argon2: { time: ARGON2_TIME, mem: ARGON2_MEM, threads: ARGON2_THREADS, keylen: ARGON2_KEYLEN },
  };
}

// Decrypt any of: argon2id (ours/legacy), canopy (Argon2i, nonce=key[:12]), legacy PBKDF2-200k.
export async function decryptKeystore(ks: LegacyKeystore, password: string): Promise<Uint8Array> {
  let key: CryptoKey;
  let nonce: Uint8Array;
  if (ks.kdf === "canopy") {
    if (!window.argon2) throw new Error("Argon2 library not loaded");
    const result = await window.argon2.hash({
      pass: password,
      salt: h2b(ks.salt),
      time: 3,
      mem: 32768,
      hashLen: 32,
      parallelism: 4,
      type: window.argon2.ArgonType.Argon2i,
    });
    const keyBytes = result.hash; // 32 bytes
    nonce = keyBytes.slice(0, 12); // canopy: nonce = key[:12]
    key = await crypto.subtle.importKey("raw", bs(keyBytes), { name: "AES-GCM" }, false, ["decrypt"]);
  } else if (!ks.kdf || ks.kdf === "argon2id") {
    key = await deriveKeyArgon2id(password, h2b(ks.salt));
    nonce = h2b(ks.iv);
  } else {
    // legacy PBKDF2 fallback — 200k iterations
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: bs(h2b(ks.salt)), iterations: 200000, hash: "SHA-256" },
      km,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    nonce = h2b(ks.iv);
  }
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(nonce) }, key, bs(h2b(ks.encrypted)));
  return new Uint8Array(dec);
}
