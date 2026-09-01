// Transaction signing + submission — ported from Frontend/app.js buildSigned/doSubmit.
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h } from "@/lib/format";
import { decVarint, encSignBytes } from "@/lib/proto";
import { rpc, submitTxRPC, queryHeight } from "@/lib/rpc";

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
  
  if (!height || !netId || !chainId) {
    const live = await queryHeight();
    height = height || live.height;
    netId = netId || live.networkId || 1;
    chainId = chainId || live.chainId || 1;
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

export const PRAXIS_ERRORS: Record<number, string> = {
  124: "Market has not expired yet — propose_outcome is only callable after expiry.",
  181: "Cannot finalize — dispute window is still open. Wait for the dispute period to close.",
  4001: "Resolver has an open position in this market. Use Forfeit Position before proposing.",
  4002: "Market creator cannot act as resolver for their own market.",
  4003: "This prediction exceeds the 20% position cap for one side. Try a smaller amount.",
  4010: "Storage error — please try again or contact support.",
  195: "Dispute panel could not be formed",
  196: "This market is not eligible for reclaim",
  197: "Reclaim window hasn't opened yet — wait 300 blocks after expiry",
  198: "Nothing to reclaim for this wallet",
  199: "You hold a position in this market and cannot act as resolver. Transfer or forfeit your shares first.",
  200: "The market creator cannot resolve their own market.",
  201: "This prediction would exceed the 20% per-address position cap for this market. Try a smaller amount.",
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
