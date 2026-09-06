// Genesis allocation authorized addresses — hardcoded in backend (constants_genesis_alloc.go)
// Frontend needs these to gate the nav item and check eligibility.

export const GENESIS_ADDRESSES: Record<string, string> = {
  liquidity: "869e664c50c5c19f7d56dbef03960b116bc54acc", // liquid, no claim msg
  community: "869e664c50c5c19f7d56dbef03960b116bc54acc", // liquid, claim-gated
  investor: "ad7cbf82b65f584a9a862caed1ab51f9f6692d2a",  // 6mo cliff + 18mo linear
  foundation: "2ed76cbe2e3f384877e84ed1999d0c159480b611", // 6mo cliff + 18mo linear
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
