"use client";
import MarketDetail from "@/components/MarketDetail";

const PH3_CANARY = "PRAXIS-NEXT-PH3";

// Next 14 / React 18: params is a plain object (NOT a Promise — that's Next 15).
export default function MarketPage({ params }: { params: { mid: string } }) {
  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <MarketDetail mid={params.mid} />
      <span className="hidden" aria-hidden="true">{PH3_CANARY}</span>
    </main>
  );
}
