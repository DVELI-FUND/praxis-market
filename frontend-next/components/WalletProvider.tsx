"use client";
import { useEffect, type ReactNode } from "react";
import { useWallet } from "@/store/wallet";
import { getProvider } from "@/lib/wallet";

export default function WalletProvider({ children }: { children: ReactNode }) {
  const restore = useWallet((s) => s.restore);
  const checkDrift = useWallet((s) => s.checkDrift);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);

  useEffect(() => {
    void restore();

    const iv = setInterval(() => void checkDrift(), 15000);
    const onWake = () => {
      if (!document.hidden) void checkDrift();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    const t = setTimeout(() => {
      const prov = getProvider();
      if (!prov?.on) return;
      prov.on("accountsChanged", (accounts: string[]) => {
        if (!accounts.length) disconnect();
        else void connect();
      });
    }, 500);

    return () => {
      clearInterval(iv);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [restore, checkDrift, connect, disconnect]);

  return <>{children}</>;
}
