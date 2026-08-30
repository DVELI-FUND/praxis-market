"use client";
import { useEffect } from "react";
import { useToast } from "@/store/toast";

export default function Toaster() {
  const msg = useToast((s) => s.msg);
  const kind = useToast((s) => s.kind);
  const clear = useToast((s) => s.clear);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(clear, 4500);
    return () => clearTimeout(t);
  }, [msg, clear]);

  if (!msg) return null;
  return (
    <div
      key={msg}
      className={`toast-in fixed bottom-[70px] left-1/2 z-[220] -translate-x-1/2 whitespace-nowrap rounded-card border px-4 py-2 font-mono text-[10px] md:bottom-6 ${
        kind === "err" ? "border-down/40 bg-[#1a0810] text-down" : "border-up/40 bg-[#081a10] text-up"
      }`}
    >
      {msg}
    </div>
  );
}
