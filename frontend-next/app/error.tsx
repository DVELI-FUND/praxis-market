"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="relative z-10 mx-auto flex min-h-[70vh] max-w-[980px] items-center justify-center px-4">
      <div className="w-full max-w-[420px] rounded-card border border-down/40 bg-surface-grad p-6 text-center shadow-card">
        <div className="mb-2 font-mono text-[26px] text-down">⚠</div>
        <h1 className="mb-1 font-display text-[18px] font-extrabold text-ink">Something went wrong</h1>
        <p className="mb-4 font-mono text-[10px] leading-relaxed text-ink-3">
          A client-side exception occurred. If this persists after retrying, clear site data (stale cache) and reload.
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={() => reset()} className="rounded-card bg-up px-4 py-2 font-sans text-[12px] font-extrabold text-black shadow-glowUp hover:brightness-110">
            ↻ Retry
          </button>
          <button onClick={() => window.location.reload()} className="rounded-card border border-line-2 px-4 py-2 font-mono text-[10px] text-ink-2 hover:border-up hover:text-up">
            Hard reload
          </button>
        </div>
      </div>
    </main>
  );
}
