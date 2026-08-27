"use client";
import type { ReactNode } from "react";
import WalletProvider from "./WalletProvider";
import DriftBanner from "./DriftBanner";
import BottomNav from "./BottomNav";

export default function Chrome({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <DriftBanner />
      {children}
      <BottomNav />
    </WalletProvider>
  );
}
