// Proto encoding helpers — ported verbatim from Frontend/proto.js (field numbers match tx.proto).
import { b2h, h2b } from "@/lib/format";

export function encV(value: bigint | number): Uint8Array {
  const out: number[] = [];
  let v = typeof value === "bigint" ? value : BigInt(value);
  while (v > 127n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return new Uint8Array(out);
}
export function cat(...a: Uint8Array[]): Uint8Array {
  const t = a.reduce((s, x) => s + x.length, 0);
  const o = new Uint8Array(t);
  let off = 0;
  for (const x of a) {
    o.set(x, off);
    off += x.length;
  }
  return o;
}
export function tag(f: number, w: number): Uint8Array {
  return encV((BigInt(f) << 3n) | BigInt(w));
}
export function vf(f: number, v: bigint | number): Uint8Array {
  const x = typeof v === "bigint" ? v : BigInt(v);
  if (x === 0n) return new Uint8Array(0);
  return cat(tag(f, 0), encV(x));
}
export function bf(f: number, b: Uint8Array): Uint8Array {
  if (!b || !b.length) return new Uint8Array(0);
  return cat(tag(f, 2), encV(b.length), b);
}
export function sf(f: number, s: string): Uint8Array {
  if (!s || !s.length) return new Uint8Array(0);
  const e = new TextEncoder().encode(s);
  return cat(tag(f, 2), encV(e.length), e);
}
export function ef(f: number, m: Uint8Array): Uint8Array {
  if (!m || !m.length) return new Uint8Array(0);
  return cat(tag(f, 2), encV(m.length), m);
}
export function boolF(f: number, v: boolean): Uint8Array {
  return cat(tag(f, 0), new Uint8Array([v ? 1 : 0]));
}
export function encAny(typeUrl: string, inner: Uint8Array): Uint8Array {
  return cat(sf(1, typeUrl), bf(2, inner));
}

export function encSend(from: string, to: string, amt: bigint | number): Uint8Array {
  return cat(bf(1, h2b(from)), bf(2, h2b(to)), vf(3, amt));
}
export function encCreate(creator: string, b0: bigint | number, expiry: bigint | number, nonce: bigint | number, question: string, rules: string): Uint8Array {
  return cat(bf(1, h2b(creator)), vf(2, b0), vf(3, expiry), vf(4, nonce), sf(5, question), sf(6, rules || ""));
}
export function encPredict(mid: string, bettor: string, outcome: boolean, shares: bigint | number, maxcost: bigint | number): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(bettor)), boolF(3, outcome), vf(4, shares), vf(5, maxcost));
}
export function encClaim(mid: string, claimant: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(claimant)));
}
export function encReclaim(mid: string, claimant: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(claimant)));
}
export function encRegister(addr: string, stake: bigint | number): Uint8Array {
  return cat(bf(1, h2b(addr)), vf(2, stake));
}
export function encPropose(mid: string, resolver: string, outcome: boolean, bond: bigint | number): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(resolver)), boolF(3, outcome), vf(4, bond));
}
export function encDispute(mid: string, addr: string, bond: bigint | number): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(addr)), vf(3, bond));
}
export function encCommit(mid: string, voter: string, hash: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(voter)), bf(3, h2b(hash)));
}
export function encReveal(mid: string, voter: string, vote: boolean, nonce: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(voter)), boolF(3, vote), bf(4, h2b(nonce)));
}
export function encTally(mid: string, addr: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(addr)));
}
export function encFinalize(mid: string, addr: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(addr)));
}
export function encSlash(mid: string, addr: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(addr)));
}
export function encForfeit(mid: string, resolver: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(resolver)));
}
export function encUnstakeResolver(addr: string, amount: bigint | number): Uint8Array {
  return cat(bf(1, h2b(addr)), vf(2, amount));
}
export function encClaimUnbonded(addr: string): Uint8Array {
  return cat(bf(1, h2b(addr)));
}
export function encClaimCreatorFee(mid: string, creator: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(creator)));
}
export function encCancelMarket(mid: string, creator: string): Uint8Array {
  return cat(bf(1, h2b(mid)), bf(2, h2b(creator)));
}

export interface SignMeta {
  txTime: bigint;
  fee: number;
  height: number;
  memo?: string;
  netId?: number;
  chainId?: number;
}

export function encSignBytes(msgType: string, typeUrl: string, inner: Uint8Array, m: SignMeta): Uint8Array {
  const any = encAny(typeUrl, inner);
  return cat(
    sf(1, msgType),
    ef(2, any),
    vf(4, m.height),
    vf(5, m.txTime),
    vf(6, m.fee || 10000),
    m.memo ? sf(7, m.memo) : new Uint8Array(0),
    vf(8, m.netId || 1),
    vf(9, m.chainId || 1)
  );
}

export function decVarint(buf: Uint8Array, pos: number): { v: bigint; p: number } {
  let r = 0n,
    s = 0n;
  while (pos < buf.length) {
    const b = BigInt(buf[pos++]);
    r |= (b & 0x7fn) << s;
    s += 7n;
    if (!(b & 0x80n)) break;
  }
  return { v: r, p: pos };
}

export function b2b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function encRewardResolver(addr: string, epoch: number | bigint): Uint8Array {
  return cat(bf(1, h2b(addr)), vf(2, epoch));
}
export function encRewardBuilder(addr: string): Uint8Array {
  return cat(bf(1, h2b(addr)));
}
export function encRewardCommunity(addr: string): Uint8Array {
  return cat(bf(1, h2b(addr)));
}
export function encRewardInvestor(addr: string): Uint8Array {
  return cat(bf(1, h2b(addr)));
}
export function encRewardProtocol(addr: string): Uint8Array {
  return cat(bf(1, h2b(addr)));
}
