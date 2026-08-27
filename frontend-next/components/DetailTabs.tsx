"use client";
import { useState } from "react";
import ActivityTab from "./ActivityTab";
import HoldersTab from "./HoldersTab";
import InfoTab from "./InfoTab";
import type { MarketDetail, Holder, DisputeContext } from "@/lib/detail";

interface Props {
  mid: string;
  market: MarketDetail;
  holders: Holder[];
  disputeContext?: DisputeContext;
}

export default function DetailTabs({ mid, market, holders, disputeContext }: Props) {
  const [tab, setTab] = useState<"activity" | "holders" | "info">("activity");

  return (
    <div>
      <div className="flex gap-1 border-b border-line">
        <button
          onClick={() => setTab("activity")}
          className={`-mb-px border-b-2 px-4 py-2 font-mono text-[10px] tracking-[1px] transition-colors ${
            tab === "activity" ? "border-up text-up" : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          ⚡ Activity
        </button>
        <button
          onClick={() => setTab("holders")}
          className={`-mb-px border-b-2 px-4 py-2 font-mono text-[10px] tracking-[1px] transition-colors ${
            tab === "holders" ? "border-up text-up" : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          ◈ Top Holders
        </button>
        <button
          onClick={() => setTab("info")}
          className={`-mb-px border-b-2 px-4 py-2 font-mono text-[10px] tracking-[1px] transition-colors ${
            tab === "info" ? "border-up text-up" : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          ℹ Info
        </button>
      </div>

      <div className="rounded-b-card border-x border-b border-line bg-surface">
        {tab === "activity" && <ActivityTab mid={mid} holders={holders} />}
        {tab === "holders" && <HoldersTab holders={holders} />}
        {tab === "info" && <InfoTab market={market} disputeContext={disputeContext} />}
      </div>
    </div>
  );
}
