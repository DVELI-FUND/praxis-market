import { create } from "zustand";

interface ToastState {
  msg: string;
  kind: "ok" | "err";
  show: (m: string, err?: boolean) => void;
  clear: () => void;
}

export const useToast = create<ToastState>((set) => ({
  msg: "",
  kind: "ok",
  show: (m, err) => set({ msg: m, kind: err ? "err" : "ok" }),
  clear: () => set({ msg: "" }),
}));
