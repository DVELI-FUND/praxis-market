// Server-side banner resolver — HTML pages (imgur albums etc.) can't be read
// client-side (CORS), so we fetch here, extract og:image, and redirect.
const ALLOWED = ["imgur.com", "i.imgur.com", "ipfs.io", "dweb.link", "gateway.pinata.cloud", "cf-ipfs.com", "fleek.co"];

export const dynamic = "force-dynamic";

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
      return new Response(null, { status: 302, headers: { ...cache, Location: img } });
    }
    
    // Fallback for imgur albums: hunt for any i.imgur.com direct image URL in the HTML
    if (target.hostname.includes("imgur")) {
      const imgurMatch = html.match(/https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)/i);
      if (imgurMatch) {
        return new Response(null, { status: 302, headers: { ...cache, Location: imgurMatch[0] } });
      }
    }
    
    // Last resort: microlink (oEmbed is blocked by imgur in 2026)
    try {
      const mr = await fetch("https://api.microlink.io/?url=" + encodeURIComponent(target.href));
      const mj = (await mr.json()) as { data?: { image?: { url?: string } } };
      const mi = mj?.data?.image?.url;
      if (mi) return new Response(null, { status: 302, headers: { ...cache, Location: mi } });
    } catch {
      // fall through to 404
    }
    return new Response("no image found", { status: 404 });
  } catch {
    return new Response("resolver error", { status: 502 });
  }
}
