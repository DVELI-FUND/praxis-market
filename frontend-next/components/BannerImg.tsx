"use client";
import { useEffect, useState, type ReactNode } from "react";
import { extractImg } from "@/lib/markets";
import { normalizeBanner } from "@/lib/img";

const OG_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
const OG_RE2 = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i;

// Banner from rules' [IMG:…] with a fallback ladder:
// 0) normalizeBanner (direct / ipfs gateway / our /api/img resolver)
// 1) CORS proxy fetch + client-side og:image parse
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
      fetch("https://api.corsproxy.io/?url=" + encodeURIComponent(raw))
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error("proxy " + r.status))))
        .then((html) => {
          if (!alive) return;
          const m = html.match(OG_RE) || html.match(OG_RE2);
          if (m) {
            let u = m[1];
            if (u.startsWith("//")) u = "https:" + u;
            setSrc(u);
          } else setStage(2);
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
    return () => {
      alive = false;
    };
  }, [stage, raw]);

  if (!raw) return <>{fallback}</>;
  if (!src) return stage >= 3 ? <>{fallback}</> : null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => {
        setSrc(null);
        setStage((s) => s + 1);
      }}
    />
  );
}
