"use client";
import { use } from "react";
import MarketDetail from "@/components/MarketDetail";

const PH3_CANARY = "PRAXIS-NEXT-PH3";

interface PageProps {
  params: Promise<{ mid: string }>;
}

export default function MarketPage({ params }: PageProps) {
  const { mid } = use(params);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <MarketDetail mid={mid} />
      <span className="hidden" aria-hidden="true">{PH3_CANARY}</span>
    </main>
  );
}
