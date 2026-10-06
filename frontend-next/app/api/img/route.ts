// Server-side banner resolver — HTML pages (imgur albums etc.) can't be read
// client-side (CORS), so we fetch here, extract og:image, and redirect.
const ALLOWED = ["imgur.com", "i.imgur.com", "ipfs.io", "dweb.link", "gateway.pinata.cloud", "cf-ipfs.com", "fleek.co"];

export const dynamic = "force-dynamic";

// Proxy resolved image bytes through our own origin: browsers attach a Referer
// header to <img> loads and i.imgur.com hotlink-blocks those (403/404).
// A server-side fetch carries no Referer, so it always succeeds.
async function proxyImage(imgUrl: string, cache: Record<string, string>): Promise<Response> {
  try {
    const ir = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) PraxisBannerBot/1.0" },
      redirect: "follow",
    });
    if (!ir.ok) return proxyImage(imgUrl, cache);
    const ct = (ir.headers.get("content-type") || "").split(";")[0];
    if (!ct.startsWith("image/")) return proxyImage(imgUrl, cache);
    const buf = await ir.arrayBuffer();
    if (buf.byteLength > 4_500_000) return proxyImage(imgUrl, cache);
    return new Response(buf, { headers: { ...cache, "Content-Type": ct, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return proxyImage(imgUrl, cache);
  }
}


export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (!ALLOWED.some((h) => target.hostname === h || target.hostname.endsWith("." + h))) {
    return new Response("host not allowed", { status: 400 });
  }
  const cache = { "Cache-Control": "public, max-age=3600" };
  try {
    const r = await fetch(target.href, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
      redirect: "follow",
    });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
    const ct = r.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return new Response(await r.arrayBuffer(), { headers: { ...cache, "Content-Type": ct } });
    }
    const html = await r.text();
    
    // Standard og:image extraction
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    
    if (m) {
      let img = m[1];
      if (img.startsWith("//")) img = "https:" + img;
      return proxyImage(img, cache);
    }
    
    // Fallback for imgur albums: hunt for any i.imgur.com direct image URL in the HTML
    if (target.hostname.includes("imgur")) {
      const imgurMatch = html.match(/https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)/i);
      if (imgurMatch) {
        return proxyImage(imgurMatch[0], cache);
      }
    }
    
    // Last resort: microlink (oEmbed is blocked by imgur in 2026)
    try {
      const mr = await fetch("https://api.microlink.io/?url=" + encodeURIComponent(target.href));
      const mj = (await mr.json()) as { data?: { image?: { url?: string } } };
      const mi = mj?.data?.image?.url;
      if (mi) return proxyImage(mi, cache);
    } catch {
      // fall through to 404
    }
    return new Response("no image found", { status: 404 });
  } catch {
    return new Response("resolver error", { status: 502 });
  }
}
