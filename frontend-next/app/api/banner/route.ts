import { put } from "@vercel/blob";
import { createHash } from "crypto";

// Resolves any banner URL (album page, direct image, ipfs) through /api/img,
// then stores the bytes in Vercel Blob (market-banners/) and returns the
// permanent public URL. Content-hash named → same image = same blob.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!url) return new Response("missing url", { status: 400 });
  try {
    // reuse the resolver ladder; follow redirects to the actual image bytes
    const r = await fetch(new URL("/api/img?url=" + encodeURIComponent(url), req.url), {
      redirect: "follow",
      headers: { "User-Agent": "PraxisBannerStore/1.0" },
    });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.startsWith("image/")) return new Response("unresolvable banner url", { status: 404 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return new Response("empty image", { status: 502 });
    if (buf.length > 4_500_000) return new Response("image too large (>4.5MB)", { status: 413 });
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("gif") ? "gif" : ct.includes("svg") ? "svg" : "jpg";
    const name = "market-banners/" + createHash("sha256").update(buf).digest("hex").slice(0, 24) + "." + ext;
    const blob = await put(name, buf, { access: "public", contentType: ct, addRandomSuffix: false });
    return Response.json({ url: blob.url }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return new Response("blob store error", { status: 500 });
  }
}
