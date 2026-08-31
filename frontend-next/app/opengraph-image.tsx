import { ImageResponse } from "next/og";

export const alt = "Praxis — Prediction Markets on Canopy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><path d="M40 300 C100 300 140 100 200 100 C260 100 300 300 360 300" fill="none" stroke="#f5f5f5" stroke-width="34" stroke-linecap="round"/><circle cx="200" cy="100" r="40" fill="#00e88a"/></svg>`
  );

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", background: "#0a0a0a",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
        }}
      >
        <img src={LOGO} width={150} height={150} alt="" />
        <div style={{ color: "#f5f5f5", fontSize: 76, fontWeight: 800, letterSpacing: 10 }}>PRAXIS</div>
        <div style={{ color: "#a3a3a3", fontSize: 30 }}>Predict the future. Earn on your conviction.</div>
        <div style={{ color: "#00e88a", fontSize: 22, letterSpacing: 6 }}>PREDICTION MARKETS ON CANOPY</div>
      </div>
    ),
    { ...size }
  );
}
