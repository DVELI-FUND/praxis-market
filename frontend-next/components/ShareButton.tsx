"use client";
import { useState } from "react";

interface Props {
  mid: string;
  question: string;
}

export default function ShareButton({ mid, question }: Props) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/market/${mid}` : "";

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: question, text: question, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={share}
      className="rounded-card border border-line-2 px-3 py-1.5 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up"
      title="Share market"
    >
      {copied ? "✓ Copied" : "⎘ Share"}
    </button>
  );
}
