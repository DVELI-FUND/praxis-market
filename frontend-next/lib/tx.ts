// Transaction signing + submission — ported from Frontend/app.js buildSigned/doSubmit.
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h } from "@/lib/format";
import { decVarint, encSignBytes } from "@/lib/proto";
import { rpc, submitTxRPC, queryHeight } from "@/lib/rpc";
import { getChainContext } from "@/lib/chainContext";

export const TYPE_URLS: Record<string, string> = {
  send: "type.googleapis.com/types.MessageSend",
  create_market: "type.googleapis.com/types.MessageCreateMarket",
  submit_prediction: "type.googleapis.com/types.MessageSubmitPrediction",
  claim_winnings: "type.googleapis.com/types.MessageClaimWinnings",
  register_resolver: "type.googleapis.com/types.MessageRegisterResolver",
  propose_outcome: "type.googleapis.com/types.MessageProposeOutcome",
  file_dispute: "type.googleapis.com/types.MessageFileDispute",
  commit_vote: "type.googleapis.com/types.MessageCommitVote",
  reveal_vote: "type.googleapis.com/types.MessageRevealVote",
  tally_votes: "type.googleapis.com/types.MessageTallyVotes",
  finalize_market: "type.googleapis.com/types.MessageFinalizeMarket",
  claim_slash: "type.googleapis.com/types.MessageClaimSlash",
  reclaim_stake: "type.googleapis.com/types.MessageReclaimStake",
  forfeit_position: "type.googleapis.com/types.MessageForfeitPosition",
  claim_creator_fee: "type.googleapis.com/types.MessageClaimCreatorFee",
  cancel_market: "type.googleapis.com/types.MessageCancelMarket",
  unstake_resolver: "type.googleapis.com/types.MessageUnstakeResolver",
  claim_unbonded_stake: "type.googleapis.com/types.MessageClaimUnbondedStake",
  claim_resolver_reward: "type.googleapis.com/types.MessageClaimResolverReward",
  claim_builder_reward: "type.googleapis.com/types.MessageClaimBuilderReward",
  claim_community_reward: "type.googleapis.com/types.MessageClaimCommunityReward",
  claim_investor_reward: "type.googleapis.com/types.MessageClaimInvestorReward",
  claim_protocol_reward: "type.googleapis.com/types.MessageClaimProtocolReward",
  claim_genesis_community_alloc: "type.googleapis.com/types.MessageClaimGenesisCommunityAlloc",
  claim_genesis_investor_alloc: "type.googleapis.com/types.MessageClaimGenesisInvestorAlloc",
  claim_genesis_foundation_alloc: "type.googleapis.com/types.MessageClaimGenesisFoundationAlloc",
};

export interface TxMeta {
  fee?: number;
  height: number;
  netId?: number;
  chainId?: number;
}

// Node accepts camelCase JSON with hex bytes (legacy buildSigned format).
export async function buildSigned(
  privKey: Uint8Array,
  pubKey: Uint8Array,
  msgType: string,
  typeUrl: string,
  inner: Uint8Array,
  meta: TxMeta
): Promise<Record<string, unknown>> {
  const txTime = BigInt(Date.now()) * 1000n;
  
  // Fallback to live query if meta values are missing (matches old frontend behavior)
  let height = meta.height;
  let netId = meta.netId;
  let chainId = meta.chainId;
  
  // Read from global store first (mirrors old frontend's window.currentHeight/ChainID/NetworkID)
  const ctx = getChainContext();
  if (!height || !netId || !chainId) {
    height = height || ctx.height;
    netId = netId || ctx.networkId || 1;
    chainId = chainId || ctx.chainId || 30;
  }
  
  // Fallback to live query if still missing
  if (!height || !netId || !chainId) {
    const live = await queryHeight();
    height = height || live.height;
    netId = netId || live.networkId || 1;
    chainId = chainId || live.chainId || 30;
  }
  
  const p = { txTime, fee: meta.fee || 10000, height, memo: "", netId, chainId };
  const sb = encSignBytes(msgType, typeUrl, inner, p);
  const sig = await bls12_381.sign(sb, privKey);
  const base = {
    signature: { publicKey: b2h(pubKey), signature: b2h(sig) },
    createdHeight: p.height,
    time: Number(txTime),
    fee: p.fee,
    memo: "",
    networkID: p.netId,
    chainID: p.chainId,
  };
  if (msgType === "send") {
    let pos = 0;
    let fromB = new Uint8Array(0);
    let toB = new Uint8Array(0);
    let amt = 0n;
    while (pos < inner.length) {
      const { v: tagV, p: p1 } = decVarint(inner, pos);
      pos = p1;
      const fn = Number(tagV >> 3n);
      const wt = Number(tagV & 7n);
      if (wt === 2) {
        const { v: ln, p: p2 } = decVarint(inner, pos);
        pos = p2;
        const val = inner.slice(pos, pos + Number(ln));
        pos += Number(ln);
        if (fn === 1) fromB = val;
        else if (fn === 2) toB = val;
      } else if (wt === 0) {
        const { v, p: p2 } = decVarint(inner, pos);
        pos = p2;
        if (fn === 3) amt = v;
      }
    }
    const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
    return { ...base, type: "send", msg: { fromAddress: toHex(fromB), toAddress: toHex(toB), amount: Number(amt) } };
  }
  return { ...base, type: msgType, msgTypeUrl: typeUrl, msgBytes: b2h(inner) };
}

// Mirrors plugin/go/contract/error.go (+ patch_v3/v4). Codes the chain never emits are not listed.
// NOTE: Go reuses 181 for both "dispute window still open" and "already disputed".
export const PRAXIS_ERRORS: Record<number, string> = {
  9: "Insufficient funds.",
  14: "Fee below the minimum — use at least 10,000 uPRX (0.01 PRX).",
  120: "Market not found.",
  121: "This market isn't open for trading (not started, expired, or already closed).",
  122: "This market has been cancelled.",
  123: "This market has not been resolved yet.",
  124: "Market has not expired yet — propose_outcome is only callable after expiry.",
  125: "The resolution window has not opened yet.",
  127: "Nonce must be non-zero.",
  128: "Question must not be empty.",
  129: "Liquidity (b0) is below the minimum — 60 PRX for binary markets, 75 PRX for multi-option.",
  140: "No position found for this address in this market.",
  141: "Already claimed.",
  142: "Price moved past your max cost. Raise your slippage or try again.",
  143: "Minimum purchase is 1 share.",
  144: "The market pool can't cover this right now.",
  160: "This address is not a registered resolver.",
  161: "Resolver reputation (RRS) is below the minimum to propose.",
  162: "No resolver is registered for this market.",
  163: "An outcome has already been proposed for this market.",
  164: "Bond is below the minimum for this market. The minimum grows with the pool size — raise the bond.",
  180: "The dispute window has closed.",
  181: "Dispute window is still open (can't finalize yet), or this market is already disputed.",
  182: "This market is not in a disputed state.",
  183: "You are not on the dispute panel for this market.",
  184: "The commit phase has ended.",
  185: "The reveal phase has not started yet.",
  186: "The reveal phase has ended.",
  187: "Revealed vote does not match your committed hash (check the vote and the salt).",
  188: "You already committed a vote.",
  189: "You already revealed your vote.",
  190: "The reveal phase has not ended yet.",
  191: "Votes were already tallied.",
  192: "This market has not been finalized.",
  193: "No slash proceeds to claim.",
  194: "Commit hash must be exactly 32 bytes (64 hex characters).",
  195: "Dispute panel could not be formed (not enough eligible resolvers).",
  196: "This market is not eligible for reclaim.",
  197: "Reclaim window hasn't opened yet — it opens 24h (8,640 blocks) after expiry if no outcome was proposed.",
  198: "Nothing to reclaim for this wallet.",
  199: "You hold a position in this market and cannot act as resolver. Forfeit your shares first.",
  200: "The market creator cannot resolve their own market.",
  201: "This would exceed the 20% per-address position cap for this side of the market. Try a smaller amount.",
  202: "Resolver stake below minimum — 500,000 PRX required.",
  203: "Cooldown period has not elapsed yet.",
  204: "Pool is empty — nothing to claim.",
  205: "Market is not finalized.",
  207: "Resolver RRS is zero — not eligible for rewards.",
  208: "No successful resolutions in this epoch.",
  210: "Active proposal exists — unstake not allowed.",
  211: "Resolver is not active.",
  212: "No unbonding stake to claim.",
  213: "Unbonding period not complete.",
  214: "Resolver record not found.",
  215: "Market has expired.",
  216: "Market has positions — cannot cancel.",
  217: "Unbonding already pending.",
  218: "You already have the maximum of 50 open markets. Wait for some to resolve or cancel an empty one.",
  219: "Nothing vested yet — the cliff hasn't passed, or everything vested has already been claimed.",
  220: "This resolver still has open proposals or dispute panels — finish them before unstaking.",
  230: "Claim window closed (30 days after finalization). Unclaimed winnings were swept.",
  231: "Fee below the minimum — use at least 10,000 uPRX (0.01 PRX).",
};

export function friendlyError(code?: number | null, msg?: string): string {
  if (!code && msg) {
    const m = msg.match(/"code":(\d+)/);
    if (m) code = parseInt(m[1]);
  }
  if (code && PRAXIS_ERRORS[code]) return PRAXIS_ERRORS[code];
  return msg || "Unknown error";
}

// Legacy doSubmit confirmation flow: wait ~25s, then check /v1/query/failed-txs.
export async function waitForConfirmation(
  address: string,
  hash: string,
  waitMs = 25000
): Promise<{ ok: boolean; message: string }> {
  await new Promise((r) => setTimeout(r, waitMs));
  try {
    const d = await rpc<{ results?: { txHash?: string; error?: { code?: number; msg?: string } }[] }>(
      "/v1/query/failed-txs",
      { address, perPage: 20 }
    );
    const failed = (d.results || []).find((r) => r.txHash === hash);
    if (failed) {
      return { ok: false, message: "✗ Failed — " + friendlyError(failed.error?.code, failed.error?.msg || "Transaction failed") };
    }
    return { ok: true, message: "✓ Confirmed — " + (hash.length > 20 ? hash.slice(0, 20) + "…" : hash) };
  } catch {
    return { ok: true, message: "✓ Submitted — could not confirm status" };
  }
}
