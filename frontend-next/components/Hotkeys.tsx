"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cmd/Ctrl+K → jump to search (desktop power-user shortcut).
export default function Hotkeys() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
