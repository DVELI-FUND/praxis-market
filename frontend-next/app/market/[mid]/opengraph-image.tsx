import { ImageResponse } from "next/og";
import { b64ToHex } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

const LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><path d="M40 300 C100 300 140 100 200 100 C260 100 300 300 360 300" fill="none" stroke="#f5f5f5" stroke-width="34" stroke-linecap="round"/><circle cx="200" cy="100" r="40" fill="#00e88a"/></svg>`
  );

const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(2) + "k" : String(Math.round(n)));

export default async function Image({ params }: { params: { mid: string } }) {
  let question = "Prediction market on Praxis";
  let pct: number | null = null;
  let vol = "";
  try {
    const r = await fetch("https://prax.val-a.grad.dev.app.canopynetwork.org/plugin/v1/query/markets", { next: { revalidate: 60 } });
    const raw = await r.json();
    const arr: any[] = Array.isArray(raw) ? raw : raw.markets || [];
    const m = arr.find((x) => b64ToHex(String(x.id || x.market_id || "")) === params.mid);
    if (m) {
      const q = String(m.question || m.rules || "").replace(/^\[.*?\]\s*/, "");
      if (q) question = q;
      const qy = Number(m.q_yes || 0), qn = Number(m.q_no || 0);
      if (qy + qn > 0) {
        pct = Math.round((qy * 100) / (qy + qn));
        vol = fmt((qy + qn) / 1e6) + " PRX";
      }
    }
  } catch {}

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0a0a0a", display: "flex", flexDirection: "column", padding: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={LOGO} width={54} height={54} alt="" />
          <div style={{ color: "#f5f5f5", fontSize: 30, fontWeight: 800, letterSpacing: 5 }}>PRAXIS</div>
          <div style={{ color: "#00e88a", fontSize: 18, letterSpacing: 4, marginLeft: 12 }}>LIVE ON CANOPY</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ color: "#f5f5f5", fontSize: 46, fontWeight: 800, lineHeight: 1.25, maxHeight: 240, overflow: "hidden" }}>
            {question}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          {pct !== null && (
            <div style={{ color: "#00e88a", fontSize: 64, fontWeight: 800 }}>{pct}% YES</div>
          )}
          {vol && <div style={{ color: "#22d3ee", fontSize: 28 }}>Vol {vol}</div>}
          <div style={{ color: "#737373", fontSize: 22, marginLeft: "auto" }}>trade on praxis →</div>
        </div>
      </div>
    ),
    { ...size, alt: question }
  );
}
