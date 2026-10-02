import { create } from "zustand";
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h, h2b } from "@/lib/format";
import {
  addressFromPub,
  connectWith,
  currentEthAccount,
  disconnectWallet,
  friendlyWalletError,
  getActiveProvider,
  setActiveProvider,
  silentRestore,
  type EthProvider,
  type WalletSession,
} from "@/lib/wallet";
import type { DiscoveredWallet } from "@/lib/walletProviders";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "drift";

interface WalletState {
  ethAddress: string | null;
  praxisAddress: string | null;
  pubHex: string | null;
  privKey: Uint8Array | null;
  pubKey: Uint8Array | null;
  status: WalletStatus;
  error: string | null;
  restored: boolean;
  walletId: string | null;
  walletName: string | null;
  modalOpen: boolean;
  applySession: (s: WalletSession) => void;
  openModal: () => void;
  closeModal: () => void;
  connect: () => Promise<void>; // pill / banner entry point: reconnect same wallet if drifted, else open picker
  connectWallet: (w: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  restore: () => Promise<void>;
  checkDrift: () => Promise<void>;
  importKey: (hex: string) => Promise<void>;
}

// One accountsChanged listener, always bound to the wallet the user actually picked.
let detach: (() => void) | null = null;
function attachAccountListener(prov: EthProvider) {
  detach?.();
  detach = null;
  if (!prov.on) return;
  const h = (accounts: string[]) => {
    const st = useWallet.getState();
    if (!accounts || !accounts.length) st.disconnect();
    else void st.checkDrift();
  };
  prov.on("accountsChanged", h);
  detach = () => prov.removeListener?.("accountsChanged", h);
}

let lastWallet: DiscoveredWallet | null = null;

export const useWallet = create<WalletState>((set, get) => ({
  ethAddress: null,
  praxisAddress: null,
  pubHex: null,
  privKey: null,
  pubKey: null,
  status: "disconnected",
  error: null,
  restored: false,
  walletId: null,
  walletName: null,
  modalOpen: false,

  applySession: (s) =>
    set({
      ethAddress: s.ethAddress,
      praxisAddress: s.praxisAddress,
      pubHex: s.pubHex,
      privKey: s.privKey,
      pubKey: s.pubKey,
      status: "connected",
      error: null,
    }),

  openModal: () => set({ modalOpen: true, error: null }),
  closeModal: () => {
    if (get().status === "connecting") return; // don't orphan an in-flight wallet request
    set({ modalOpen: false, error: null });
  },

  connect: async () => {
    const st = get();
    if (st.status === "connecting") return;
    if (st.status === "drift" && lastWallet) return get().connectWallet(lastWallet);
    get().openModal();
  },

  connectWallet: async (w) => {
    const prev = get().status;
    if (prev === "connecting") return; // double-tap guard
    set({ status: "connecting", error: null, walletName: w.name });
    try {
      const s = await connectWith(w);
      lastWallet = w;
      setActiveProvider(w.provider);
      attachAccountListener(w.provider);
      get().applySession(s);
      set({ walletId: w.id, walletName: w.name, modalOpen: false });
    } catch (e) {
      set({ status: prev, error: friendlyWalletError(e) });
    }
  },

  disconnect: () => {
    detach?.();
    detach = null;
    lastWallet = null;
    disconnectWallet();
    set({
      ethAddress: null,
      praxisAddress: null,
      pubHex: null,
      privKey: null,
      pubKey: null,
      status: "disconnected",
      error: null,
      walletId: null,
      walletName: null,
    });
  },

  restore: async () => {
    if (get().restored) return;
    set({ restored: true });
    try {
      const r = await silentRestore();
      if (r && get().status === "disconnected") {
        lastWallet = r.wallet;
        setActiveProvider(r.wallet.provider);
        attachAccountListener(r.wallet.provider);
        get().applySession(r.session);
        set({ walletId: r.wallet.id, walletName: r.wallet.name });
      }
    } catch {
      // silent fail on auto-reconnect
    }
  },

  checkDrift: async () => {
    const st = get();
    if (st.status !== "connected" && st.status !== "drift") return;
    if (!st.ethAddress || !getActiveProvider()) return; // imported-key sessions never drift
    try {
      const acc = await currentEthAccount();
      if (!acc) return;
      if (acc !== st.ethAddress) set({ status: "drift" });
      else if (st.status === "drift") set({ status: "connected" });
    } catch {
      // silent
    }
  },

  importKey: async (hex) => {
    const priv = h2b(hex);
    if (priv.length !== 32) throw new Error("Private key must be 32 bytes");
    const pub = bls12_381.getPublicKey(priv);
    const addr = await addressFromPub(pub);
    detach?.();
    detach = null;
    lastWallet = null;
    setActiveProvider(undefined);
    set({
      ethAddress: null,
      walletId: null,
      walletName: "Praxis keystore",
      privKey: priv,
      pubKey: pub,
      pubHex: b2h(pub),
      praxisAddress: addr,
      status: "connected",
      error: null,
      modalOpen: false,
    });
  },
}));
