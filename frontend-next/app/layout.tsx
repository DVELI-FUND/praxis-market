import type { Metadata } from "next";
import { Syne, DM_Mono, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import Providers from "./providers";
import Chrome from "@/components/Chrome";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-display" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Praxis — Prediction Markets",
  description:
    "Client-side prediction market terminal for the Canopy network. All reads against public RPC; keys never leave your browser.",
  other: { "build-phase": "ph2" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${syne.variable} ${dmMono.variable} ${dmSans.variable} bg-bg text-ink font-sans`}>
        <Providers>
          <Chrome>{children}</Chrome>
        </Providers>
      </body>
    </html>
  );
}
