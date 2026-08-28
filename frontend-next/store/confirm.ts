import { create } from "zustand";

export type ConfirmRow = [string, string, string?];

interface ConfirmState {
  open: boolean;
  title: string;
  rows: ConfirmRow[];
  resolve: ((ok: boolean) => void) | null;
}

export const useConfirm = create<ConfirmState>(() => ({
  open: false,
  title: "",
  rows: [],
  resolve: null,
}));

export function showConfirm(title: string, rows: ConfirmRow[]): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ open: true, title, rows, resolve }));
}

export function answerConfirm(ok: boolean): void {
  const r = useConfirm.getState().resolve;
  useConfirm.setState({ open: false, resolve: null });
  if (r) r(ok);
}
