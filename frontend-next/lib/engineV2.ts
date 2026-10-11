// Engine v2 activation. Set ENGINE_V2_HEIGHT to the SAME block height as the chain's
// ENGINE_V2_HEIGHT (engine_v2_wire.go) when you ship the activation release.
// From that height every new market must be N-outcome: "binary" is a 2-option market.
export const ENGINE_V2_HEIGHT = 88441;

export function engineV2Active(height: number): boolean {
  return ENGINE_V2_HEIGHT !== Number.MAX_SAFE_INTEGER && height >= ENGINE_V2_HEIGHT;
}

/** Must match PATCH_V6_HEIGHT in plugin/go/contract/patch_v6.go. */
export const PATCH_V6_HEIGHT = 90000;
/** Blocks winners have to claim after finalization: 24h (8,640) for v2 markets before PATCH_V6_HEIGHT, 30 days otherwise. */
export const V2_CLAIM_WINDOW = 8640;
export const LEGACY_CLAIM_WINDOW = 259200;
export function claimWindowFor(engineV2?: boolean, height = 0): number {
  if (height >= PATCH_V6_HEIGHT) return LEGACY_CLAIM_WINDOW;
  return engineV2 ? V2_CLAIM_WINDOW : LEGACY_CLAIM_WINDOW;
}
