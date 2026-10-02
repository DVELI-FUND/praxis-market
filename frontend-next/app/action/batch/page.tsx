"use client";
import { useState } from "react";
import { useWallet } from "@/store/wallet";
import { isMasterAuthority } from "@/lib/genesis";
import { ACTIONS } from "@/lib/actions";
import { CATS_TREE } from "@/lib/cats";
import { signAndBroadcast } from "@/lib/broadcast";
import { TYPE_URLS } from "@/lib/tx";
import { useToast } from "@/store/toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryHeight } from "@/lib/rpc";
import { fmtPRX } from "@/lib/format";

interface MarketSpec {
  q: string;
  cat: string;
  sub?: string;
  exp: string;
  rules: string;
  yes?: string;
  no?: string;
  img?: string;
  b0?: number;
  status?: "pending" | "success" | "error";
  error?: string;
}

export default function BatchSeederPage() {
  const { praxisAddress, privKey, pubKey } = useWallet();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const [json, setJson] = useState("");
  const [markets, setMarkets] = useState<MarketSpec[]>([]);
  const [running, setRunning] = useState(false);

  const isMaster = isMasterAuthority(praxisAddress);

  const validate = () => {
    try {
      const parsed = JSON.parse(json) as MarketSpec[];
      if (!Array.isArray(parsed)) throw new Error("Expected array");
      
      const errors: string[] = [];
      parsed.forEach((m, i) => {
        if (!m.q?.trim()) errors.push(`#${i + 1}: question empty`);
        if (!m.exp) errors.push(`#${i + 1}: missing expiry`);
        if (!m.cat) errors.push(`#${i + 1}: missing category`);
        
        const catDef = CATS_TREE.find((c) => c.key === m.cat);
        if (!catDef) errors.push(`#${i + 1}: unknown category "${m.cat}"`);
        else if (m.sub && !catDef.subs.find((s) => s.key === m.sub)) {
          errors.push(`#${i + 1}: unknown subcategory "${m.sub}" for ${m.cat}`);
        }
        
        const expDate = new Date(m.exp);
        if (isNaN(expDate.getTime())) errors.push(`#${i + 1}: invalid expiry "${m.exp}"`);
      });
      
      if (errors.length > 0) {
        toast(errors.join("; "), true);
        return;
      }
      
      setMarkets(parsed.map((m) => ({ ...m, status: "pending" })));
      toast(`✓ Validated ${parsed.length} markets — ready to execute`);
    } catch (e) {
      toast(`Parse error: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  };

  const execute = async () => {
    if (!praxisAddress || !privKey || !pubKey) {
      toast("Connect wallet with private key", true);
      return;
    }
    
    setRunning(true);
    const def = ACTIONS.create;
    
    for (let i = 0; i < markets.length; i++) {
      const m = markets[i];
      try {
        const freshChain = await queryClient.fetchQuery({ queryKey: ["chain-height"], queryFn: queryHeight });
        
        const vals = {
          cat: m.cat,
          sub: m.sub || "",
          question: m.q,
          out_yes: m.yes || "",
          out_no: m.no || "",
          creator: praxisAddress,
          b0: m.b0 || 60,
          expiry: m.exp,
          rules: m.rules,
          img: m.img || "",
          fee: 10000,
        };
        
        const inner = def.build(vals, { wallet: praxisAddress, height: freshChain.height });
        
        await signAndBroadcast({
          privKey,
          pubKey,
          address: praxisAddress,
          height: freshChain.height,
          netId: freshChain.networkId,
          chainId: freshChain.chainId,
          msgType: def.msgType,
          typeUrl: TYPE_URLS[def.msgType],
          inner,
          fee: 10000,
        });
        
        setMarkets((prev) => prev.map((x, idx) => idx === i ? { ...x, status: "success" } : x));
        toast(`✓ Market ${i + 1}/${markets.length} created`);
        
        // Wait 2 blocks between markets to avoid nonce collision
        await new Promise((r) => setTimeout(r, 30000));
      } catch (e) {
        setMarkets((prev) => prev.map((x, idx) =>
          idx === i ? { ...x, status: "error", error: e instanceof Error ? e.message : String(e) } : x
        ));
        toast(`✗ Market ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`, true);
      }
    }
    
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["markets"] });
    toast("Batch complete");
  };

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Connect wallet to access batch seeder
        </div>
      </main>
    );
  }

  if (!isMaster) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <div className="mb-3 text-ink-3">🔒</div>
          <div className="mb-1 font-display text-[16px] font-bold text-ink">Master Authority Required</div>
          <div className="font-mono text-[11px] text-ink-3">
            Batch seeding is restricted to the master authority wallet
          </div>
        </div>
      </main>
    );
  }

  const successCount = markets.filter((m) => m.status === "success").length;
  const errorCount = markets.filter((m) => m.status === "error").length;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-amberx">
          <span className="inline-block h-px w-5 bg-amberx" /> Admin
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Batch Market Seeder</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Paste JSON array of markets → validate → execute sequential creation
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">JSON Input</div>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='[{"q":"Will BTC hit $150k?","cat":"crypto","sub":"bitcoin","exp":"2027-01-01T12:00","rules":"CoinGecko close"}]'
            className="w-full rounded-card border border-line bg-surface-2 p-3 font-mono text-[11px] text-ink outline-none focus:border-amberx"
            rows={12}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={validate}
              disabled={running || !json.trim()}
              className="flex-1 rounded-card border border-amberx bg-amberx/10 py-2.5 font-display text-[12px] font-bold text-amberx transition-all hover:bg-amberx/20 disabled:opacity-50"
            >
              Validate
            </button>
            <button
              onClick={execute}
              disabled={running || markets.length === 0}
              className="flex-1 rounded-card bg-up py-2.5 font-display text-[12px] font-bold text-black transition-all hover:bg-up/90 disabled:opacity-50"
            >
              {running ? "Executing..." : `Execute (${markets.length} markets)`}
            </button>
          </div>
        </div>

        {markets.length > 0 && (
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                Batch Status: {successCount}/{markets.length} success, {errorCount} errors
              </div>
              <div className="font-mono text-[11px] text-ink-2">
                Cost: {fmtPRX(BigInt(markets.length * 5060 * 1000000))} PRX (bonds return at finalize)
              </div>
            </div>
            <div className="space-y-2">
              {markets.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-card border p-3 ${
                    m.status === "success"
                      ? "border-up/30 bg-up/5"
                      : m.status === "error"
                      ? "border-down/30 bg-down/5"
                      : "border-line bg-surface-2"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 font-mono text-[10px] font-bold text-ink-3">#{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 font-display text-[12px] font-bold text-ink">{m.q}</div>
                      <div className="flex items-center gap-2 font-mono text-[9px] text-ink-3">
                        <span className="uppercase">{m.cat}{m.sub ? ` · ${m.sub}` : ""}</span>
                        <span>·</span>
                        <span>Expires {m.exp}</span>
                      </div>
                      {m.error && (
                        <div className="mt-1 font-mono text-[10px] text-down">{m.error}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {m.status === "success" && <span className="font-mono text-[11px] font-bold text-up">✓</span>}
                      {m.status === "error" && <span className="font-mono text-[11px] font-bold text-down">✗</span>}
                      {m.status === "pending" && <span className="font-mono text-[11px] text-ink-3">⏳</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
