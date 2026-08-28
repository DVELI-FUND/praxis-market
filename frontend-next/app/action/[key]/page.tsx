"use client";
import { ACTIONS } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";

export default function ActionPage({ params }: { params: { key: string } }) {
  const def = ACTIONS[params.key];

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      {def ? (
        <>
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
              <span className="inline-block h-px w-5 bg-up" /> {def.eye}
            </div>
            <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">{def.title}</h1>
            <p className="mt-1 text-[13px] text-ink-2">{def.sub}</p>
          </div>
          <div className="mx-auto max-w-[560px]">
            <ActionForm def={def} />
          </div>
        </>
      ) : (
        <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">
          ⚠ Unknown action
        </div>
      )}
    </main>
  );
}
