// Banner URL resolution — user-supplied banner URLs normalized to renderable srcs.
// ipfs:// → public gateway; direct images pass through; HTML pages (imgur albums,
// galleries) route through /api/img which extracts og:image server-side (CORS-safe).
const DIRECT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i;

export function normalizeBanner(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  if (u.startsWith("ipfs://")) {
    return "https://ipfs.io/ipfs/" + u.slice(7).replace(/^ipfs\//, "");
  }
  try {
    const p = new URL(u);
    if (DIRECT_RE.test(p.pathname)) return u;
    if (p.hostname === "i.imgur.com") return u;
    if (p.hostname === "imgur.com") {
      const m = p.pathname.match(/^\/([A-Za-z0-9]+)$/);
      if (m && m[1] !== "a" && m[1] !== "gallery") return "https://i.imgur.com/" + m[1] + ".jpg";
    }
    // HTML page → server-side og:image resolver
    return "/api/img?url=" + encodeURIComponent(u);
  } catch {
    return u;
  }
}
