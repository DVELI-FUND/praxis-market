// Keystore lifecycle — exact port of Frontend/crypto-keystore.js
// Argon2id (3 / 64MB / 4 threads / 32B) → AES-GCM, Canopy CLI Argon2i
// (3 / 32MB / 4, nonce = key[:12]), legacy PBKDF2-200k fallback.
import { argon2id, argon2i } from "hash-wasm";
import { b2h, h2b } from "@/lib/format";

export const ARGON2_TIME = 3;
export const ARGON2_MEM = 65536; // 64 MB
export const ARGON2_THREADS = 4;
export const ARGON2_KEYLEN = 32;
export const PRAXIS_KEYSTORE_LS = "praxis_keystore";

export interface KeystoreFile {
  version?: number;
  kdf?: string;
  publicKey: string;
  keyAddress: string;
  salt: string;
  iv: string;
  encrypted: string;
  argon2?: { time: number; mem: number; threads: number; keylen: number };
}

async function deriveArgon2id(password: string, salt: Uint8Array, a?: KeystoreFile["argon2"]): Promise<CryptoKey> {
  const p = a ?? { time: ARGON2_TIME, mem: ARGON2_MEM, threads: ARGON2_THREADS, keylen: ARGON2_KEYLEN };
  const hash = await argon2id({
    password,
    salt,
    parallelism: p.threads,
    iterations: p.time,
    memorySize: p.mem,
    hashLength: p.keylen,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", hash as unknown as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Canopy CLI format: Argon2i (not id), mem=32MB, keyLen=32, nonce=key[:12]
async function deriveCanopy(password: string, salt: Uint8Array): Promise<{ key: CryptoKey; nonce: Uint8Array }> {
  const hash = await argon2i({
    password,
    salt,
    parallelism: 4,
    iterations: 3,
    memorySize: 32768,
    hashLength: 32,
    outputType: "binary",
  });
  const keyBytes = hash as unknown as Uint8Array;
  const nonce = keyBytes.slice(0, 12);
  const key = await crypto.subtle.importKey("raw", keyBytes as unknown as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  return { key, nonce };
}

async function derivePbkdf2(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(password) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200000, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptWith(raw: KeystoreFile, password: string, kdf: string): Promise<Uint8Array> {
  const salt = h2b(raw.salt);
  const iv = h2b(raw.iv);
  const data = h2b(raw.encrypted);
  if (kdf === "canopy") {
    const { key, nonce } = await deriveCanopy(password, salt);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, data as BufferSource));
  }
  if (kdf === "pbkdf2") {
    const key = await derivePbkdf2(password, salt);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  }
  const key = await deriveArgon2id(password, salt, raw.argon2);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
}

// Mirrors old decryptKey fallback ladder: declared kdf first, then PBKDF2 legacy.
export async function decryptKeystore(raw: KeystoreFile, password: string): Promise<Uint8Array> {
  if (!raw.encrypted || !raw.salt || !raw.iv || !raw.publicKey) throw new Error("Invalid keystore file");
  const kdf = raw.kdf || "argon2id";
  try {
    return await decryptWith(raw, password, kdf);
  } catch {
    return await decryptWith(raw, password, "pbkdf2");
  }
}

export async function encryptKey(priv: Uint8Array, password: string): Promise<Omit<KeystoreFile, "publicKey" | "keyAddress">> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveArgon2id(password, salt);
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, priv as BufferSource);
  return {
    version: 1,
    kdf: "argon2id",
    salt: b2h(salt),
    iv: b2h(iv),
    encrypted: b2h(new Uint8Array(enc)),
    argon2: { time: ARGON2_TIME, mem: ARGON2_MEM, threads: ARGON2_THREADS, keylen: ARGON2_KEYLEN },
  };
}
