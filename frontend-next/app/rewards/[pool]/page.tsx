"use client";
import RewardPoolPage, { POOL_META, type PoolKey } from "@/components/RewardPoolPage";

export default function RewardPoolRoute({ params }: { params: { pool: string } }) {
  const pool = params.pool as PoolKey;
  const valid = Object.keys(POOL_META).includes(pool);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      {valid ? (
        <RewardPoolPage pool={pool} />
      ) : (
        <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">
          ⚠ Unknown reward pool
        </div>
      )}
    </main>
  );
}
