import { TYPE_URLS } from "@/lib/tx";
import {
  encSend, encCreate, encClaim, encReclaim, encRegister, encPropose, encDispute,
  encCommit, encReveal, encTally, encFinalize, encSlash, encForfeit,
  encUnstakeResolver, encClaimUnbonded, encClaimCreatorFee, encCancelMarket,
  encRewardResolver, encRewardBuilder, encRewardCommunity, encRewardInvestor,
  encRewardProtocol,
} from "@/lib/proto";

const W = 1000000n;

// Convert a datetime-local string to a block height (5s blocks, Canopy default)
export function datetimeToBlock(datetimeStr: string, currentHeight: number): number {
  if (!datetimeStr) return currentHeight + 1000;
  const targetMs = new Date(datetimeStr).getTime();
  const nowMs = Date.now();
  const deltaMs = Math.max(0, targetMs - nowMs);
  const deltaBlocks = Math.floor(deltaMs / 5000);
  return currentHeight + deltaBlocks;
}

export function buildRulesWithCat(cat: string, rules: string): string {
  const stripped = rules.replace(/^\[CAT:\w+\]\s*/, "");
  return "[CAT:" + cat + "] " + stripped;
}
export function buildRulesWithImg(rules: string, imgUrl: string): string {
  const stripped = rules.replace(/\[IMG:[^\]]+\]\s*/g, "").trim();
  if (!imgUrl) return stripped;
  return stripped + (stripped ? " " : "") + "[IMG:" + imgUrl.trim() + "]";
}
export function buildRulesWithOutcomes(rules: string, yesLabel: string, noLabel: string): string {
  const stripped = rules.replace(/\[OUT:[^\]]+\]\s*/g, "").trim();
  const yl = (yesLabel || "").trim();
  const nl = (noLabel || "").trim();
  if (!yl || !nl || (yl.toUpperCase() === "YES" && nl.toUpperCase() === "NO")) return stripped;
  return stripped + (stripped ? " " : "") + "[OUT:" + yl + "|" + nl + "]";
}

export type FieldType = "wallet" | "addr" | "mid" | "number" | "text" | "hash64" | "outcome" | "cat" | "datetime";
export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  def?: number;
  scale?: bigint;
  min?: number;
  hint?: string;
}
export type Vals = Record<string, string | number | boolean>;
export interface ActionCtx {
  wallet: string | null;
  height: number;
}
export interface ActionDef {
  key: string;
  msgType: string;
  title: string;
  eye: string;
  sub: string;
  gate?: "resolver" | "admin" | "creator";
  statusCard?: "resolver";
  planner?: "propose" | "dispute";
  fields: FieldDef[];
  build: (v: Vals, ctx: ActionCtx) => Uint8Array;
  validate?: (v: Vals) => string | null;
}

const FEE: FieldDef = { id: "fee", label: "Fee (uPRX)", type: "number", def: 10000 };
const WALLET: FieldDef = { id: "addr", label: "Address", type: "wallet" };
const MID: FieldDef = { id: "mid", label: "Market ID (40 hex)", type: "mid" };

const s = (v: Vals, k: string): string => String(v[k] ?? "").toLowerCase();
const u = (v: Vals, k: string, scale: bigint = W): bigint =>
  BigInt(Math.floor(Number(v[k]) || 0)) * scale;
const b = (v: Vals, k: string): boolean => Boolean(v[k]);

export const ACTIONS: Record<string, ActionDef> = {
  send: {
    key: "send", msgType: "send", title: "Send $PRX", eye: "Account", sub: "Transfer PRX to another address",
    fields: [ { id: "from", label: "From Address", type: "wallet" }, { id: "to", label: "To Address", type: "addr" }, { id: "amount", label: "Amount (PRX)", type: "number", def: 1, scale: W, min: 1 }, FEE ],
    build: (v) => encSend(s(v, "from"), s(v, "to"), u(v, "amount")),
  },
  claim: {
    key: "claim", msgType: "claim_winnings", title: "Claim Winnings", eye: "Collect Payout", sub: "Proportional payout from losing pool after finalization",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encClaim(s(v, "mid"), s(v, "addr")),
  },
  reclaim: {
    key: "reclaim", msgType: "reclaim_stake", title: "Reclaim Stake", eye: "Recover Funds", sub: "Recover funds from expired markets with no resolver",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encReclaim(s(v, "mid"), s(v, "addr")),
  },
  claimcreator: {
    key: "claimcreator", msgType: "claim_creator_fee", title: "Claim Creator Fee", eye: "Creator", sub: "Collect accumulated fees from markets you created", gate: "creator",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encClaimCreatorFee(s(v, "mid"), s(v, "addr")),
  },
  cancel: {
    key: "cancel", msgType: "cancel_market", title: "Cancel Market", eye: "Admin", sub: "Cancel an open market before expiry — creator bond returned", gate: "creator",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encCancelMarket(s(v, "mid"), s(v, "addr")),
  },
  finalize: {
    key: "finalize", msgType: "finalize_market", title: "Finalize Market", eye: "Admin", sub: "Collect finalization bounty after the dispute window closes", gate: "admin",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encFinalize(s(v, "mid"), s(v, "addr")),
  },
  forfeit: {
    key: "forfeit", msgType: "forfeit_position", title: "Forfeit Position", eye: "Resolver", sub: "Exit your position before proposing — required for COI-1", gate: "resolver",
    fields: [ MID, { id: "addr", label: "Resolver Address", type: "wallet" }, FEE ],
    build: (v) => encForfeit(s(v, "mid"), s(v, "addr")),
  },
  propose: {
    key: "propose", msgType: "propose_outcome", planner: "propose",  title: "Propose Outcome", eye: "Resolver", sub: "Submit your resolution after market expiry", gate: "resolver",
    fields: [ MID, { id: "addr", label: "Resolver Address", type: "wallet" }, { id: "out", label: "Proposed Outcome", type: "outcome" }, { id: "bond", label: "Proposal Bond (PRX)", type: "number", def: 60, scale: W }, FEE ],
    build: (v) => encPropose(s(v, "mid"), s(v, "addr"), b(v, "out"), u(v, "bond")),
  },
  dispute: {
    key: "dispute", msgType: "file_dispute", planner: "dispute",  title: "File Dispute", eye: "Resolver", sub: "Challenge a proposed outcome during the dispute window", gate: "resolver",
    fields: [ MID, WALLET, { id: "bond", label: "Bond Amount (PRX)", type: "number", def: 60, scale: W, min: 1, hint: "Forfeited if your dispute is rejected" }, FEE ],
    build: (v) => encDispute(s(v, "mid"), s(v, "addr"), u(v, "bond")),
  },
  commit: {
    key: "commit", msgType: "commit_vote", title: "Commit Vote", eye: "Resolver", sub: "Submit a blinded commitment during the voting phase", gate: "resolver",
    fields: [ MID, WALLET, { id: "hash", label: "Commitment Hash (hex)", type: "hash64" }, FEE ],
    build: (v) => encCommit(s(v, "mid"), s(v, "addr"), s(v, "hash")),
  },
  reveal: {
    key: "reveal", msgType: "reveal_vote", title: "Reveal Vote", eye: "Resolver", sub: "Reveal your committed vote during the reveal phase", gate: "resolver",
    fields: [ MID, WALLET, { id: "out", label: "Vote", type: "outcome" }, { id: "salt", label: "Salt (hex)", type: "hash64" }, FEE ],
    build: (v) => encReveal(s(v, "mid"), s(v, "addr"), b(v, "out"), s(v, "salt")),
  },
  tally: {
    key: "tally", msgType: "tally_votes", title: "Tally Votes", eye: "Resolver", sub: "Trigger vote tallying after the reveal phase ends", gate: "resolver",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encTally(s(v, "mid"), s(v, "addr")),
  },
  slash: {
    key: "slash", msgType: "claim_slash", title: "Claim Slash", eye: "Resolver", sub: "Claim slashed stake from a penalized resolver", gate: "resolver",
    fields: [ MID, WALLET, FEE ],
    build: (v) => encSlash(s(v, "mid"), s(v, "addr")),
  },
  register: {
    key: "register", msgType: "register_resolver", title: "Register as Resolver", eye: "Resolver", sub: "Stake PRX to earn resolution fees — minimum 500,000 PRX", statusCard: "resolver",
    fields: [ WALLET, { id: "stake", label: "Stake Amount (PRX)", type: "number", def: 500000, scale: W }, FEE ],
    build: (v) => encRegister(s(v, "addr"), u(v, "stake")),
    validate: (v) => (Number(v.stake) < 500000 ? "Stake min 500,000 PRX" : null),
  },
  unstake: {
    key: "unstake", msgType: "unstake_resolver", title: "Unstake Resolver", eye: "Resolver", sub: "Begin 120,960-block unbonding period — partial or full exit", gate: "resolver", statusCard: "resolver",
    fields: [ WALLET, { id: "amount", label: "Amount (PRX) — 0 = full exit", type: "number", def: 0, scale: W }, FEE ],
    build: (v) => encUnstakeResolver(s(v, "addr"), u(v, "amount")),
  },
  claimunbonded: {
    key: "claimunbonded", msgType: "claim_unbonded_stake", title: "Claim Unbonded Stake", eye: "Resolver", sub: "Release tokens after the 120,960-block unbonding period", gate: "resolver", statusCard: "resolver",
    fields: [ WALLET, FEE ],
    build: (v) => encClaimUnbonded(s(v, "addr")),
  },
  create: {
    key: "create", msgType: "create_market", title: "Create Market", eye: "Admin", sub: "Deploy a new prediction market on Praxis", gate: "admin",
    fields: [
      { id: "cat", label: "Category", type: "cat" },
      { id: "question", label: "Question", type: "text" },
      { id: "out_yes", label: "Custom YES label (optional)", type: "text" },
      { id: "out_no", label: "Custom NO label (optional)", type: "text" },
      { id: "creator", label: "Creator Address", type: "wallet" },
      { id: "b0", label: "B0 Liquidity (PRX)", type: "number", def: 60, scale: W },
      { id: "expiry", label: "Expiry", type: "datetime" },
      { id: "rules", label: "Rules / Resolution criteria", type: "text" },
      { id: "img", label: "Banner Image URL (optional)", type: "text", hint: "imgur album/page, i.imgur.com direct, or ipfs:// — auto-resolved" },
      FEE,
    ],
    build: (v, ctx) => {
      const rules = buildRulesWithOutcomes(
        buildRulesWithImg(buildRulesWithCat(s(v, "cat") || "other", s(v, "rules")), s(v, "img")),
        String(v.out_yes ?? ""),
        String(v.out_no ?? "")
      );
      const exp = datetimeToBlock(String(v.expiry || ""), ctx.height);
      const nonce = BigInt(Date.now()) * 1000n;
      return encCreate(s(v, "creator"), u(v, "b0"), BigInt(exp), nonce, String(v.question ?? ""), rules);
    },
    validate: (v) => (!String(v.question ?? "").trim() ? "Question required" : null),
  },
};

export const ACTION_SECTIONS: { name: string; gate?: "resolver" | "admin" | "creator"; keys: string[] }[] = [
  { name: "Account", keys: ["send", "claim", "reclaim"] },
  { name: "Creator", gate: "creator", keys: ["claimcreator", "cancel", "create"] },
  {
    name: "Resolver", gate: "resolver",
    keys: ["register", "forfeit", "propose", "dispute", "commit", "reveal", "tally", "slash", "unstake", "claimunbonded"],
  },
  { name: "Admin", gate: "admin", keys: ["create", "finalize", "cancel"] },
  { name: "Rewards", keys: ["claim_resolver", "claim_builder", "claim_community", "claim_investor", "claim_protocol"] },
];

// Reward actions (epoch-based claims)
const REWARD_FIELDS_EPOCH: FieldDef[] = [
  WALLET,
  { id: "epoch", label: "Epoch", type: "number", def: 0, hint: "0 = auto (current - 1)" },
  FEE,
];
const REWARD_FIELDS: FieldDef[] = [WALLET, FEE];

ACTIONS.claim_resolver = {
  key: "claim_resolver",
  msgType: "claim_resolver_reward",
  title: "Claim Resolver Reward",
  eye: "Rewards",
  sub: "Earn 20% of transaction fees for validating markets — claim per epoch",
  fields: REWARD_FIELDS_EPOCH,
  build: (v, ctx) => {
    const epoch = Number(v.epoch) || Math.floor(ctx.height / 1000) - 1;
    return encRewardResolver(s(v, "addr"), BigInt(epoch));
  },
};

ACTIONS.claim_builder = {
  key: "claim_builder",
  msgType: "claim_builder_reward",
  title: "Claim Builder Reward",
  eye: "Rewards",
  sub: "Earn 20% of fees as a protocol builder — claim per epoch",
  fields: REWARD_FIELDS,
  build: (v) => encRewardBuilder(s(v, "addr")),
};

ACTIONS.claim_community = {
  key: "claim_community",
  msgType: "claim_community_reward",
  title: "Claim Community Reward",
  eye: "Rewards",
  sub: "Earn 20% of fees for community contributions",
  fields: REWARD_FIELDS,
  build: (v) => encRewardCommunity(s(v, "addr")),
};

ACTIONS.claim_investor = {
  key: "claim_investor",
  msgType: "claim_investor_reward",
  title: "Claim Investor Reward",
  eye: "Rewards",
  sub: "Earn 20% of fees as an early investor",
  fields: REWARD_FIELDS,
  build: (v) => encRewardInvestor(s(v, "addr")),
};

ACTIONS.claim_protocol = {
  key: "claim_protocol",
  msgType: "claim_protocol_reward",
  title: "Claim Protocol Reward",
  eye: "Rewards",
  sub: "Earn 20% of fees for protocol governance",
  fields: REWARD_FIELDS,
  build: (v) => encRewardProtocol(s(v, "addr")),
};
