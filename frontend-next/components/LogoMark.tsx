"use client";
// Praxis brand mark: outcome ball balanced on the probability curve.
// Stroke uses currentColor so it adapts to dark/light themes.
export default function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true">
      <path
        d="M40 300 C100 300 140 100 200 100 C260 100 300 300 360 300"
        fill="none"
        stroke="currentColor"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <circle cx="200" cy="100" r="40" fill="#00e88a" />
    </svg>
  );
}
