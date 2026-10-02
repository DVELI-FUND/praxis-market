"use client";
import { useEffect, type ReactNode } from "react";
import { useWallet } from "@/store/wallet";
import { ensureWalletDiscovery } from "@/lib/walletProviders";

export default function WalletProvider({ children }: { children: ReactNode }) {
  const restore = useWallet((s) => s.restore);
  const checkDrift = useWallet((s) => s.checkDrift);

  useEffect(() => {
    ensureWalletDiscovery();
    void restore();

    const iv = setInterval(() => void checkDrift(), 15000);
    const onWake = () => {
      if (!document.hidden) void checkDrift();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [restore, checkDrift]);

  return <>{children}</>;
}
