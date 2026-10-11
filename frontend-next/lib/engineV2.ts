// Engine v2 activation. Set ENGINE_V2_HEIGHT to the SAME block height as the chain's
// ENGINE_V2_HEIGHT (engine_v2_wire.go) when you ship the activation release.
// From that height every new market must be N-outcome: "binary" is a 2-option market.
export const ENGINE_V2_HEIGHT = 88441;

export function engineV2Active(height: number): boolean {
  return ENGINE_V2_HEIGHT !== Number.MAX_SAFE_INTEGER && height >= ENGINE_V2_HEIGHT;
}
