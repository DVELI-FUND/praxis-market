// Engine v2 activation. Set ENGINE_V2_HEIGHT to the SAME block height as the chain's
// ENGINE_V2_HEIGHT (engine_v2_wire.go) when you ship the activation release.
// From that height every new market must be N-outcome: "binary" is a 2-option market.
export const ENGINE_V2_HEIGHT = 88441;

export function engineV2Active(height: number): boolean {
  return ENGINE_V2_HEIGHT !== Number.MAX_SAFE_INTEGER && height >= ENGINE_V2_HEIGHT;
}

/** Blocks winners have to claim after finalization: 24h (8,640) for v2 markets, 30 days for older ones. */
export const V2_CLAIM_WINDOW = 8640;
export const LEGACY_CLAIM_WINDOW = 259200;
export function claimWindowFor(engineV2?: boolean): number {
  return engineV2 ? V2_CLAIM_WINDOW : LEGACY_CLAIM_WINDOW;
}
