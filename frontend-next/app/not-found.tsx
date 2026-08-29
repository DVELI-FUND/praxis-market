import Link from "next/link";
export default function NotFound() {
  return (
    <main className="relative z-10 mx-auto flex min-h-[70vh] max-w-[980px] items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-2 bg-grad-brand bg-clip-text font-display text-[52px] font-extrabold text-transparent">404</div>
        <p className="mb-5 font-mono text-[11px] text-ink-3">This market doesn't exist.</p>
        <Link href="/" className="rounded-card bg-grad-up px-5 py-2.5 font-sans text-[12px] font-extrabold text-black shadow-glowUp hover:brightness-110">
          ← Back to Markets
        </Link>
      </div>
    </main>
  );
}
