// Commit–reveal helpers for dispute-panel voting. Mirrors ComputeCommitHash in plugin/go/contract/helpers.go:
//   commit = sha256( voteByte(0x01 YES / 0x00 NO) || nonce || voterAddress(20 bytes) )
// Since PATCH_V4 the chain rejects reveal nonces shorter than 32 bytes, so we always generate exactly 32.
import { b2h, h2b } from "@/lib/format";

const KEY = (mid: string, addr: string) => `praxis_vote_${mid.toLowerCase()}_${addr.toLowerCase()}`;

export interface SavedVote {
  vote: boolean;
  nonce: string; // 64 hex
  hash: string; // 64 hex
  savedAt: number;
}

export function randomNonceHex(): string {
  return b2h(crypto.getRandomValues(new Uint8Array(32)));
}

export async function computeCommitHash(vote: boolean, nonceHex: string, voterHex: string): Promise<string> {
  const nonce = h2b(nonceHex);
  const voter = h2b(voterHex);
  const input = new Uint8Array(1 + nonce.length + voter.length);
  input[0] = vote ? 1 : 0;
  input.set(nonce, 1);
  input.set(voter, 1 + nonce.length);
  return b2h(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

export function saveVote(mid: string, addr: string, v: SavedVote): boolean {
  try {
    window.localStorage.setItem(KEY(mid, addr), JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function loadVote(mid: string, addr: string): SavedVote | null {
  try {
    const raw = window.localStorage.getItem(KEY(mid, addr));
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedVote;
    return /^[0-9a-f]{64}$/.test(v.nonce) ? v : null;
  } catch {
    return null;
  }
}
