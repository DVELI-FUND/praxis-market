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

const TABS = [
  { id: "activity", label: "⚡ Activity" },
  { id: "holders", label: "◈ Top Holders" },
  { id: "info", label: "ℹ Info" },
] as const;

export default function DetailTabs({ mid, market, holders, disputeContext }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("activity");

  return (
    <div>
      <div className="flex gap-1 rounded-t-card border border-b-0 border-line bg-surface-2 px-1.5 pt-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-card px-4 py-2 font-mono text-[10px] tracking-[1px] transition-colors ${
              tab === t.id
                ? "border border-b-0 border-line bg-surface text-up shadow-[0_-4px_16px_rgba(0,232,138,0.06)]"
                : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-b-card border border-line bg-surface shadow-card">
        {tab === "activity" && <ActivityTab mid={mid} holders={holders} />}
        {tab === "holders" && <HoldersTab holders={holders} />}
        {tab === "info" && <InfoTab market={market} disputeContext={disputeContext} />}
      </div>
    </div>
  );
}
