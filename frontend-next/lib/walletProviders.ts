// Multi-wallet discovery. EIP-6963 (multi injected provider discovery) first, then the legacy
// window.ethereum as a fallback for browsers/wallets that don't announce (some in-app browsers).
// Wallets here are only used as a *signature source*: Praxis derives its BLS key from a
// personal_sign (see lib/wallet.ts) — no EVM transaction is ever sent.
import type { EthProvider } from "@/lib/wallet";

export interface DiscoveredWallet {
  id: string; // EIP-6963 rdns, or "injected" for the legacy window.ethereum
  name: string;
  icon?: string; // data:image/... URI from the wallet (validated)
  provider: EthProvider;
}

interface AnnounceDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EthProvider;
}

const found = new Map<string, DiscoveredWallet>();
const subs = new Set<() => void>();
let started = false;

function emit() {
  subs.forEach((f) => f());
}

function onAnnounce(ev: Event) {
  const d = (ev as CustomEvent<AnnounceDetail>).detail;
  if (!d || !d.info || !d.provider || typeof d.provider.request !== "function") return;
  const rdns = String(d.info.rdns || d.info.uuid || "");
  if (!rdns) return;
  // only accept inline raster/svg data URIs for icons (never remote or javascript: URLs)
  const icon = typeof d.info.icon === "string" && /^data:image\/(png|svg\+xml|webp|jpeg|gif);/i.test(d.info.icon) ? d.info.icon : undefined;
  found.set(rdns, { id: rdns, name: String(d.info.name || rdns).slice(0, 40), icon, provider: d.provider });
  emit();
}

function legacyName(p: EthProvider & Record<string, unknown>): string {
  if (p.isRabby) return "Rabby";
  if (p.isBraveWallet) return "Brave Wallet";
  if (p.isCoinbaseWallet) return "Coinbase Wallet";
  if (p.isTrust || p.isTrustWallet) return "Trust Wallet";
  if (p.isOkxWallet || p.isOKExWallet) return "OKX Wallet";
  if (p.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

function addLegacy() {
  const eth = (window as unknown as { ethereum?: EthProvider & Record<string, unknown> }).ethereum;
  if (!eth || typeof eth.request !== "function") return;
  for (const w of found.values()) if (w.provider === eth) return; // already announced via 6963
  if (found.has("injected")) return;
  found.set("injected", { id: "injected", name: legacyName(eth), provider: eth });
  emit();
}

// Idempotent. Safe to call from any client component.
export function ensureWalletDiscovery(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Some wallets inject late (Quetta/Rabby/in-app browsers): re-probe a few times.
  for (const ms of [400, 1200, 2500, 5000]) {
    setTimeout(() => {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      addLegacy();
    }, ms);
  }
}

export function listWallets(): DiscoveredWallet[] {
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function subscribeWallets(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

// Used by silent restore: wait until the wallet we connected with last time shows up.
export async function waitForWallet(id: string, timeoutMs = 4000): Promise<DiscoveredWallet | undefined> {
  ensureWalletDiscovery();
  const started = Date.now();
  for (;;) {
    const exact = found.get(id);
    if (exact) return exact;
    if (id === "injected") addLegacy();
    if (Date.now() - started > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 100));
  }
}

export function isMobileBrowser(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Open this page inside a wallet app's built-in browser (where the wallet is injected).
export function mobileDeepLinks(): { name: string; href: string }[] {
  if (typeof window === "undefined") return [];
  const url = window.location.origin + window.location.pathname;
  const bare = url.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", href: "https://metamask.app.link/dapp/" + bare },
    { name: "Coinbase Wallet", href: "https://go.cb-w.com/dapp?cb_url=" + encodeURIComponent(url) },
    { name: "Trust Wallet", href: "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(url) },
  ];
}

export const WALLET_DOWNLOADS: { name: string; href: string }[] = [
  { name: "MetaMask", href: "https://metamask.io/download/" },
  { name: "Rabby", href: "https://rabby.io/" },
  { name: "Coinbase Wallet", href: "https://www.coinbase.com/wallet/downloads" },
];
