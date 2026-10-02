// Praxis wallet core. Any EIP-1193 wallet (MetaMask, Rabby, Coinbase, Trust, Brave, OKX, ...)
// is used purely as a signature source: personal_sign(fixed msg) → HKDF-SHA256 → 32B scalar →
// BLS12-381 keypair → address = sha256(pubkey)[:20].  The derivation (message, salt, info) is
// consensus-critical for existing users' addresses and MUST NOT change without a migration.
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h, h2b } from "@/lib/format";
import { waitForWallet, type DiscoveredWallet } from "@/lib/walletProviders";

export const PRAXIS_DERIVE_MSG =
  "Praxis BLS key derivation v1\n\nSigning this message derives your Praxis signing key.\n\nThis signature never leaves your browser.";
export const PRAXIS_STORE_PREFIX = "praxis_bls_v1_"; // LEGACY at-rest blob (AES key = public eth address). Migrated away.
const SEALED_PREFIX = "praxis_bls_v2_"; // new: AES-GCM under a non-extractable per-device key
const FP_PREFIX = "praxis_addr_v1_"; // non-secret fingerprint: ethAddr → praxisAddress
const LS_CONNECTED = "praxis_bls_connected";
const LS_WALLET = "praxis_bls_wallet";
// Set NEXT_PUBLIC_PERSIST_KEY=0 to never keep the key at rest (re-sign after every reload).
const PERSIST = process.env.NEXT_PUBLIC_PERSIST_KEY !== "0";

export interface EthProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (accounts: string[]) => void): void;
  removeListener?(event: string, cb: (accounts: string[]) => void): void;
}

export interface WalletSession {
  ethAddress: string;
  praxisAddress: string;
  pubHex: string;
  privKey: Uint8Array;
  pubKey: Uint8Array;
}

// ── active provider (the wallet the user picked) ───────────────────────────
let activeProvider: EthProvider | undefined;
export function setActiveProvider(p: EthProvider | undefined): void {
  activeProvider = p;
}
export function getActiveProvider(): EthProvider | undefined {
  return activeProvider;
}

export async function currentEthAccount(): Promise<string | null> {
  const prov = activeProvider;
  if (!prov) return null;
  const accounts = (await prov.request({ method: "eth_accounts" })) as string[];
  return accounts.length ? accounts[0].toLowerCase() : null;
}

export function friendlyWalletError(e: unknown): string {
  const err = e as { code?: number | string; message?: string };
  if (err?.code === 4001 || err?.code === "ACTION_REJECTED") return "Request cancelled in your wallet";
  if (err?.code === -32002) return "Your wallet already has a pending request — open it to continue";
  if (err?.code === 4100) return "Wallet is locked or this site is not authorized — unlock it and try again";
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
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


// ── at-rest sealing: AES-GCM key is generated once, non-extractable, kept in IndexedDB ──
const IDB_NAME = "praxis_wallet";
const IDB_STORE = "keys";
const IDB_KEY = "device-aes-v1";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getDeviceKey(create: boolean): Promise<CryptoKey | null> {
  const db = await idbOpen();
  try {
    const existing = await new Promise<CryptoKey | undefined>((res, rej) => {
      const r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => res(r.result as CryptoKey | undefined);
      r.onerror = () => rej(r.error);
    });
    if (existing) return existing;
    if (!create) return null;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(key, IDB_KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return key;
  } finally {
    db.close();
  }
}

export async function sealKey(ethAddr: string, priv: Uint8Array): Promise<void> {
  const addr = ethAddr.toLowerCase();
  const key = await getDeviceKey(true);
  if (!key) throw new Error("device key unavailable");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: new TextEncoder().encode(addr) as BufferSource },
    key,
    priv as BufferSource
  );
  window.localStorage.setItem(SEALED_PREFIX + addr, b2h(iv) + b2h(new Uint8Array(ct)));
}

export async function openSealedKey(ethAddr: string): Promise<Uint8Array | null> {
  const addr = ethAddr.toLowerCase();
  const blob = window.localStorage.getItem(SEALED_PREFIX + addr);
  if (!blob) return null;
  try {
    const key = await getDeviceKey(false);
    if (!key) return null;
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: h2b(blob.slice(0, 24)) as BufferSource, additionalData: new TextEncoder().encode(addr) as BufferSource },
      key,
      h2b(blob.slice(24)) as BufferSource
    );
    return new Uint8Array(dec);
  } catch {
    return null;
  }
}

function forgetStoredKeys(ethAddr: string): void {
  const addr = ethAddr.toLowerCase();
  window.localStorage.removeItem(SEALED_PREFIX + addr);
  window.localStorage.removeItem(PRAXIS_STORE_PREFIX + addr);
}

// ── signing + connect ───────────────────────────────────────────────────────
async function personalSign(prov: EthProvider, ethAddr: string): Promise<string> {
  const sig = (await withTimeout(
    prov.request({ method: "personal_sign", params: [PRAXIS_DERIVE_MSG, ethAddr] }),
    120000,
    "Wallet did not respond — reopen your wallet and try again"
  )) as unknown;
  if (typeof sig !== "string" || !/^0x([0-9a-fA-F]{2}){64,}$/.test(sig)) {
    throw new Error("This wallet returned an unsupported signature. Use a regular (non smart-contract) account.");
  }
  return sig;
}

export async function connectWith(w: Pick<DiscoveredWallet, "id" | "provider">): Promise<WalletSession> {
  const prov = w.provider;
  const accounts = (await withTimeout(
    prov.request({ method: "eth_requestAccounts" }),
    120000,
    "Wallet did not respond — reopen your wallet and try again"
  )) as string[];
  if (!Array.isArray(accounts) || !accounts.length) throw new Error("No accounts returned");
  const ethAddr = String(accounts[0]).toLowerCase();

  const session = await deriveFromSignature(await personalSign(prov, ethAddr));
  const fpKey = FP_PREFIX + ethAddr;
  const known = window.localStorage.getItem(fpKey);
  if (known) {
    if (known !== session.praxisAddress) {
      throw new Error(
        "This wallet produced a different Praxis address than on your previous sign-in. Refusing to continue so funds are not sent to the wrong address."
      );
    }
  } else {
    // First sign-in for this account on this device: the key is only stable if the wallet's
    // signature is deterministic (EOA/RFC6979). Smart-contract wallets may not be — verify now.
    const second = await deriveFromSignature(await personalSign(prov, ethAddr));
    if (second.praxisAddress !== session.praxisAddress) {
      throw new Error(
        "This wallet signs non-deterministically, so it cannot give you a stable Praxis address. Use a regular account (MetaMask, Rabby, Trust, ...)."
      );
    }
    window.localStorage.setItem(fpKey, session.praxisAddress);
  }

  window.localStorage.setItem(LS_CONNECTED, ethAddr);
  window.localStorage.setItem(LS_WALLET, w.id);
  window.localStorage.removeItem(PRAXIS_STORE_PREFIX + ethAddr); // purge weak legacy blob
  if (PERSIST) {
    try {
      await sealKey(ethAddr, session.privKey);
    } catch {
      // storage unavailable (private mode): session simply won't survive a reload
    }
  } else {
    forgetStoredKeys(ethAddr);
  }
  return { ...session, ethAddress: ethAddr };
}

export interface RestoredSession {
  session: WalletSession;
  wallet: DiscoveredWallet;
}

// Silent reconnect — only eth_accounts (no popups). Returns null if anything is off.
export async function silentRestore(): Promise<RestoredSession | null> {
  const last = window.localStorage.getItem(LS_CONNECTED);
  if (!last) return null;
  const walletId = window.localStorage.getItem(LS_WALLET) || "injected";
  const wallet = await waitForWallet(walletId);
  if (!wallet) return null;
  let accounts: string[];
  try {
    accounts = (await wallet.provider.request({ method: "eth_accounts" })) as string[];
  } catch {
    return null;
  }
  if (!Array.isArray(accounts) || !accounts.length) return null;
  const ethAddr = String(accounts[0]).toLowerCase();
  if (ethAddr !== last) return null;

  let priv = PERSIST ? await openSealedKey(ethAddr) : null;
  const legacy = window.localStorage.getItem(PRAXIS_STORE_PREFIX + ethAddr);
  if (!priv && legacy && PERSIST) {
    try {
      priv = await aesDecrypt(legacy, ethAddr);
      await sealKey(ethAddr, priv); // re-seal under the device key, then drop the weak blob
    } catch {
      priv = null;
    }
  }
  if (legacy) window.localStorage.removeItem(PRAXIS_STORE_PREFIX + ethAddr);
  if (!priv) return null;

  const pubKey = bls12_381.getPublicKey(priv);
  const praxisAddress = await addressFromPub(pubKey);
  const fp = window.localStorage.getItem(FP_PREFIX + ethAddr);
  if (fp && fp !== praxisAddress) return null; // stored key doesn't match the known address
  return { session: { ethAddress: ethAddr, praxisAddress, pubHex: b2h(pubKey), privKey: priv, pubKey }, wallet };
}

export function disconnectWallet(): void {
  const eth = window.localStorage.getItem(LS_CONNECTED);
  if (eth) forgetStoredKeys(eth);
  window.localStorage.removeItem(LS_CONNECTED);
  window.localStorage.removeItem(LS_WALLET);
  activeProvider = undefined;
}
