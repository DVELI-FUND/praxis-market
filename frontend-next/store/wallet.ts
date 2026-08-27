import { create } from "zustand";
import {
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
  status: WalletStatus;
  error: string | null;
  restored: boolean;
  applySession: (s: WalletSession) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  restore: () => Promise<void>;
  checkDrift: () => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  ethAddress: null,
  praxisAddress: null,
  pubHex: null,
  status: "disconnected",
  error: null,
  restored: false,

  applySession: (s) =>
    set({
      ethAddress: s.ethAddress,
      praxisAddress: s.praxisAddress,
      pubHex: s.pubHex,
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
    set({ ethAddress: null, praxisAddress: null, pubHex: null, status: "disconnected", error: null });
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

  // Mobile bridges don't push accountsChanged — poll + focus/visibility sync.
  checkDrift: async () => {
    const st = get();
    if (st.status !== "connected" && st.status !== "drift") return;
    try {
      const acc = await currentEthAccount();
      if (!acc) return; // no authorized origin info; keep cached session
      if (acc !== st.ethAddress) set({ status: "drift" });
      else if (st.status === "drift") set({ status: "connected" });
    } catch {
      // silent
    }
  },
}));
