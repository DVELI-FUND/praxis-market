// Genesis allocation authorized addresses — hardcoded in backend (constants_genesis_alloc.go)
// Frontend needs these to gate the nav item and check eligibility.

export const GENESIS_ADDRESSES: Record<string, string> = {
  liquidity: "c8ca64bb287d9032b37cf20f853bf647e4e516bf", // liquid, no claim msg
  community: "3b6293d5059dc5f552fdb66044bf31a1e70d5dbd", // liquid, claim-gated
  investor: "1140a1c5e5e82caf8eae6ddbd104b55849bd9b23",  // 6mo cliff + 18mo linear
  foundation: "ab410efe7bbf9d9f95d65bfa725feb25ade53f22", // 6mo cliff + 18mo linear
};

export function isGenesisAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const lower = addr.toLowerCase();
  return Object.values(GENESIS_ADDRESSES).includes(lower);
}

export function getGenesisPool(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  for (const [pool, a] of Object.entries(GENESIS_ADDRESSES)) {
    if (a === lower) return pool;
  }
  return null;
}
