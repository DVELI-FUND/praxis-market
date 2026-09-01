"use client";
import { useEffect, useState, type ReactNode } from "react";
import { extractImg } from "@/lib/markets";
import { normalizeBanner } from "@/lib/img";

// Banner from rules' [IMG:…] with a fallback ladder:
// 0) normalizeBanner (direct / ipfs gateway / our /api/img resolver)
// 1) imgur public oEmbed (thumbnail_url = direct i.imgur link)
// 2) microlink.io og extractor
// 3) give up → render `fallback` (never a broken image)
export default function BannerImg({ rules, className, fallback }: { rules: string; className: string; fallback?: ReactNode }) {
  const raw = extractImg(rules || "");
  const [src, setSrc] = useState<string | null>(raw ? normalizeBanner(raw) : null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!raw || stage === 0 || stage >= 3) return;
    let alive = true;
    if (stage === 1) {
      let host = "";
      try { host = new URL(raw).hostname; } catch {}
      if (!host.includes("imgur")) { setStage(2); return; }
      fetch("https://api.imgur.com/oembed.json?url=" + encodeURIComponent(raw))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("oembed " + r.status))))
        .then((j) => {
          if (!alive) return;
          const u = j?.thumbnail_url;
          if (u) setSrc(u);
          else setStage(2);
        })
        .catch(() => alive && setStage(2));
    } else if (stage === 2) {
      fetch("https://api.microlink.io/?url=" + encodeURIComponent(raw))
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const u = d?.data?.image?.url;
          if (u) setSrc(u);
          else setStage(3);
        })
        .catch(() => alive && setStage(3));
    }
    return () => { alive = false; };
  }, [stage, raw]);

  if (!raw) return <>{fallback}</>;
  if (!src) return stage >= 3 ? <>{fallback}</> : null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => { setSrc(null); setStage((s) => s + 1); }}
    />
  );
}
