// Hand-drawn Praxis category glyphs. 24x24, stroke-based, currentColor.
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  crypto:    <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 13.5 12 9l3.5 4.5M12 9v10" /></>,
  bitcoin:   <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 7.5h3.2a2.1 2.1 0 0 1 0 4.2H9.5m0 0h3.8a2.1 2.1 0 0 1 0 4.2H9.5M11 5.5v2M11 16.5v2" /></>,
  ethereum:  <><path d="M12 3.5 17 11.5 12 14.5 7 11.5Z" /><path d="M12 16.5 17 13.5 12 20.5 7 13.5Z" /></>,
  altcoins:  <><circle cx="8" cy="9.5" r="3.2" /><circle cx="16" cy="9.5" r="3.2" /><circle cx="12" cy="16.5" r="3.2" /></>,
  defi:      <><rect x="9" y="3.5" width="6" height="6" rx="1" /><rect x="3.5" y="13" width="6" height="6" rx="1" /><rect x="14.5" y="13" width="6" height="6" rx="1" /><path d="M12 9.5v3.5M6.5 13v-1.5h11V13" /></>,
  etf:       <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l6 6" /></>,
  sports:    <><path d="M7 4h10v3.5a5 5 0 0 1-10 0Z" /><path d="M7 5H4c0 3 1.8 4.2 3 4.2M17 5h3c0 3-1.8 4.2-3 4.2M12 12.5V16M8.5 20h7M10.5 20l.6-4h1.8l.6 4" /></>,
  football:  <><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2 15.4 10.7 14.1 14.7H9.9L8.6 10.7ZM12 3.5v4.7M20.1 9.6l-4.7 1.1M17.2 18.4l-3.1-3.7M6.8 18.4l3.1-3.7M3.9 9.6l4.7 1.1" /></>,
  basketball:<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5v17M6.8 5.6c3 3.6 3 9.2 0 12.8M17.2 5.6c-3 3.6-3 9.2 0 12.8" /></>,
  tennis:    <><circle cx="12" cy="12" r="8.5" /><path d="M6.2 5.8c4 2.2 4 10.2 0 12.4M17.8 5.8c-4 2.2-4 10.2 0 12.4" /></>,
  f1:        <><path d="M6 21V4M6 4h11.5L15 7.5 17.5 11H6" /></>,
  ufc:       <><path d="M7.5 11a4.5 4.5 0 0 1 9 0v2.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4Z" /><path d="M7.5 11V8.5M16.5 11v2M9.5 17.5V20h5v-2.5" /></>,
  baseball:  <><circle cx="12" cy="12" r="8.5" /><path d="M8 4.8c-2.2 4.4-2.2 10 0 14.4M16 4.8c2.2 4.4 2.2 10 0 14.4" /></>,
  hockey:    <><path d="M5 4l8 11h6M14.5 18.5h5" /><ellipse cx="17" cy="18.5" rx="2.6" ry="1.2" /></>,
  cricket:   <><path d="M10 3.5 14 7.5 7.5 16.5 3.5 12.5ZM14 7.5l2 2" /><circle cx="18" cy="17" r="2" /></>,
  politics:  <><path d="M4 20h16M6.5 20v-8.5M10.2 20v-8.5M13.8 20v-8.5M17.5 20v-8.5M4 11.5h16M12 3.5 20 11.5H4Z" /></>,
  elections: <><rect x="5" y="10" width="14" height="9" rx="1.5" /><path d="M9 10V6.5h6V10M9 13.5h6M10.5 16.5l1.5 1.5 3-3" /></>,
  policy:    <><rect x="6" y="3.5" width="12" height="17" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  geopolitics:<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17" /></>,
  finance:   <><path d="M7 6v3M7 15v3M6 9h2v6H6ZM12 4v3M12 14v4M11 7h2v7h-2ZM17 7v3M17 15v3M16 10h2v5h-2Z" /></>,
  stocks:    <><path d="M4 19.5h16M5 15.5l4-5 3 3 6-7M15 6.5h3v3" /></>,
  macro:     <><path d="M18.5 5.5l-13 13" /><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="16" r="2.6" /></>,
  commodities:<><path d="M12 4c4 4.8 6 7.8 6 10.6a6 6 0 0 1-12 0C6 11.8 8 8.8 12 4Z" /></>,
  fx:        <><path d="M4 8.5h13l-3-3M20 15.5H7l3 3" /></>,
  esports:   <><rect x="3.5" y="8" width="17" height="9" rx="4.5" /><path d="M8 11v3M6.5 12.5h3" /><circle cx="15.3" cy="11.8" r="1" fill="currentColor" stroke="none" /><circle cx="17.5" cy="13.8" r="1" fill="currentColor" stroke="none" /></>,
  lol:       <><path d="M12 3.5 15 6.5 7.5 14 4.5 11ZM4.5 19.5l3-3M15 6.5l3 3" /></>,
  cs2:       <><circle cx="12" cy="12" r="6" /><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,
  dota2:     <><path d="M12 3.5 19 6.5v5.5c0 4.8-3.4 7.8-7 9-3.6-1.2-7-4.2-7-9V6.5Z" /><path d="M12 8v8M9 11h6" /></>,
  valorant:  <><path d="M6.5 4.5 12 20.5 17.5 4.5h-3.4L12 11.5 9.9 4.5Z" /></>,
  rl:        <><path d="M12 3c3 3 4 6.8 4 10l-4 3-4-3c0-3.2 1-7 4-10ZM8 13l-3 3 3 1M16 13l3 3-3 1M12 16v4.5" /></>,
  other:     <><path d="M3 12c3-5 6-7.5 9-7.5S18 7 21 12c-3 5-6 7.5-9 7.5S6 17 3 12Z" /><circle cx="12" cy="12" r="2.6" /></>,
  culture:   <><circle cx="12" cy="9" r="4" /><path d="M9.2 12.4 7.5 20l4.5-2.4L16.5 20l-1.7-7.6" /></>,
  science:   <><path d="M10 3.5v5.5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3.5M8.5 3.5h7M8 15h8" /></>,
  weather:   <><circle cx="8" cy="8.5" r="3" /><path d="M6.5 17.5h9.7a3.4 3.4 0 0 0 0-6.8 5 5 0 0 0-9.5 1.4 2.8 2.8 0 0 0-.2 5.4Z" /></>,
};

export default function CatIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] ?? P.other}
    </svg>
  );
}
