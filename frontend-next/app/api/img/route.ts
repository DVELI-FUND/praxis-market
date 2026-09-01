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
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) PraxisBannerBot/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
    const ct = r.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return new Response(await r.arrayBuffer(), { headers: { ...cache, "Content-Type": ct } });
    }
    const html = await r.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!m) {
      try {
        const mr = await fetch("https://api.microlink.io/?url=" + encodeURIComponent(target.href));
        const mj = (await mr.json()) as { data?: { image?: { url?: string } } };
        const mi = mj?.data?.image?.url;
        if (mi) return new Response(null, { status: 302, headers: { ...cache, Location: mi } });
      } catch {
        // fall through to 404
      }
      return new Response("no og:image found", { status: 404 });
    }
    let img = m[1];
    if (img.startsWith("//")) img = "https:" + img;
    return new Response(null, { status: 302, headers: { ...cache, Location: img } });
  } catch {
    return new Response("resolver error", { status: 502 });
  }
}
