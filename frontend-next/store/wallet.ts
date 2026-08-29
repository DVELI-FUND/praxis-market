import { create } from "zustand";
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h, h2b } from "@/lib/format";
import {
  addressFromPub,
  connectMetaMask,
  currentEthAccount,
  disconnectWallet,
  silentRestore,
  type WalletSession,
} from "@/lib/wallet";

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
  applySession: (s: WalletSession) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  restore: () => Promise<void>;
  checkDrift: () => Promise<void>;
  importKey: (hex: string) => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  ethAddress: null,
  praxisAddress: null,
  pubHex: null,
  privKey: null,
  pubKey: null,
  status: "disconnected",
  error: null,
  restored: false,

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

  connect: async () => {
    set({ status: "connecting", error: null });
    try {
      const s = await connectMetaMask();
      get().applySession(s);
    } catch (e) {
      set({
        status: get().ethAddress ? "connected" : "disconnected",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  disconnect: () => {
    disconnectWallet();
    set({
      ethAddress: null,
      praxisAddress: null,
      pubHex: null,
      privKey: null,
      pubKey: null,
      status: "disconnected",
      error: null,
    });
  },

  restore: async () => {
    if (get().restored) return;
    set({ restored: true });
    try {
      const s = await silentRestore();
      if (s) get().applySession(s);
    } catch {
      // silent fail on auto-reconnect (legacy behavior)
    }
  },

  checkDrift: async () => {
    const st = get();
    if (st.status !== "connected" && st.status !== "drift") return;
    if (!st.ethAddress) return; // imported-key sessions never drift
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
    set({
      privKey: priv,
      pubKey: pub,
      pubHex: b2h(pub),
      praxisAddress: addr,
      status: "connected",
      error: null,
    });
  },
}));
