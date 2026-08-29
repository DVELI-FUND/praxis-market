// MetaMask/Rabby → BLS12-381 derivation — ported from Frontend/metamask-auth.js.
// Flow: personal_sign(fixed msg) → HKDF-SHA256 → 32B scalar → BLS keypair →
// address = sha256(pubkey)[:20]. Cache: AES-256-GCM, PBKDF2(ethAddr, 100k).
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h, h2b } from "@/lib/format";

export const PRAXIS_DERIVE_MSG =
  "Praxis BLS key derivation v1\n\nSigning this message derives your Praxis signing key.\n\nThis signature never leaves your browser.";
export const PRAXIS_STORE_PREFIX = "praxis_bls_v1_";

export interface EthProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (accounts: string[]) => void): void;
}

export interface WalletSession {
  ethAddress: string;
  praxisAddress: string;
  pubHex: string;
  privKey: Uint8Array;
  pubKey: Uint8Array;
}

export function getProvider(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { ethereum?: EthProvider }).ethereum;
}

// Quetta/Rabby inject window.ethereum asynchronously — poll, never check once.
export async function waitForProvider(timeoutMs = 3000): Promise<EthProvider | undefined> {
  const started = Date.now();
  for (;;) {
    const p = getProvider();
    if (p) return p;
    if (Date.now() - started > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function currentEthAccount(): Promise<string | null> {
  const prov = getProvider();
  if (!prov) return null;
  const accounts = (await prov.request({ method: "eth_accounts" })) as string[];
  return accounts.length ? accounts[0].toLowerCase() : null;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: new TextEncoder().encode(info) },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

export async function aesEncrypt(data: Uint8Array, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMat,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    data as BufferSource
  );
  return b2h(salt) + b2h(iv) + b2h(new Uint8Array(ct));
}

export async function aesDecrypt(hex: string, password: string): Promise<Uint8Array> {
  const salt = h2b(hex.slice(0, 32));
  const iv = h2b(hex.slice(32, 56));
  const ct = h2b(hex.slice(56));
  const keyMat = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMat,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    ct as BufferSource
  );
  return new Uint8Array(dec);
}

export async function addressFromPub(pub: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", pub as BufferSource);
  return b2h(new Uint8Array(h).slice(0, 20));
}

async function deriveFromSignature(ethSig: string): Promise<WalletSession> {
  const ikm = h2b(ethSig.startsWith("0x") ? ethSig.slice(2) : ethSig);
  const salt = new TextEncoder().encode("praxis-bls-salt-v1");
  const privKey = await hkdf(ikm, salt, "praxis-bls-key", 32);
  const pubKey = bls12_381.getPublicKey(privKey);
  const praxisAddress = await addressFromPub(pubKey);
  return {
    ethAddress: "",
    praxisAddress,
    pubHex: b2h(pubKey),
    privKey,
    pubKey,
  };
}

async function storeKey(ethAddr: string, privKey: Uint8Array): Promise<void> {
  const enc = await aesEncrypt(privKey, ethAddr.toLowerCase());
  window.localStorage.setItem(PRAXIS_STORE_PREFIX + ethAddr.toLowerCase(), enc);
}

export async function connectMetaMask(): Promise<WalletSession> {
  const prov = await waitForProvider();
  if (!prov) throw new Error("MetaMask not found — install the extension");
  const accounts = (await prov.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts.length) throw new Error("No accounts returned");
  const ethAddr = accounts[0].toLowerCase();

  const sig = (await prov.request({
    method: "personal_sign",
    params: [PRAXIS_DERIVE_MSG, ethAddr],
  })) as string;

  const session = await deriveFromSignature(sig);
  await storeKey(ethAddr, session.privKey);
  window.localStorage.setItem("praxis_bls_connected", ethAddr);
  return { ...session, ethAddress: ethAddr };
}

// Silent reconnect — zero provider probing beyond eth_accounts, no popups.
export async function silentRestore(): Promise<WalletSession | null> {
  const prov = await waitForProvider();
  if (!prov) return null;
  const last = window.localStorage.getItem("praxis_bls_connected");
  if (!last) return null;
  const accounts = (await prov.request({ method: "eth_accounts" })) as string[];
  if (!accounts.length) return null;
  const ethAddr = accounts[0].toLowerCase();
  if (ethAddr !== last) return null;
  const enc = window.localStorage.getItem(PRAXIS_STORE_PREFIX + ethAddr);
  if (!enc) return null;

  const privKey = await aesDecrypt(enc, ethAddr);
  const pubKey = bls12_381.getPublicKey(privKey);
  const praxisAddress = await addressFromPub(pubKey);
  return { ethAddress: ethAddr, praxisAddress, pubHex: b2h(pubKey), privKey, pubKey };
}

export function disconnectWallet(): void {
  const eth = window.localStorage.getItem("praxis_bls_connected");
  if (eth) window.localStorage.removeItem(PRAXIS_STORE_PREFIX + eth);
  window.localStorage.removeItem("praxis_bls_connected");
}
