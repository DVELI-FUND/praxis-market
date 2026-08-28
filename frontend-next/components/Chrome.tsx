"use client";
import type { ReactNode } from "react";
import WalletProvider from "./WalletProvider";
import DriftBanner from "./DriftBanner";
import BottomNav from "./BottomNav";
import Toaster from "./Toaster";
import ConfirmModal from "./ConfirmModal";
import MoreSheet from "./MoreSheet";

export default function Chrome({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <DriftBanner />
      {children}
      <BottomNav />
      <Toaster />
      <ConfirmModal />
      <MoreSheet />
    </WalletProvider>
  );
}
