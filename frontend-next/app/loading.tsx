export default function Loading() {
  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6 h-8 w-56 animate-pulse rounded-card bg-surface-2" />
      <div className="mb-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[220px] animate-pulse rounded-card bg-surface-grad" />
        ))}
      </div>
    </main>
  );
}
