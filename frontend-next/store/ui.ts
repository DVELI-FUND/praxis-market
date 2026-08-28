import { create } from "zustand";

interface UiState {
  moreOpen: boolean;
  setMore: (b: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  moreOpen: false,
  setMore: (b) => set({ moreOpen: b }),
}));
