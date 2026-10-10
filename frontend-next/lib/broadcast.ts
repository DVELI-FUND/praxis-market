import { buildSigned, friendlyError, waitForConfirmation } from "@/lib/tx";
import { submitTxRPC } from "@/lib/rpc";
import { useToast } from "@/store/toast";

export interface BroadcastOpts {
  privKey: Uint8Array;
  pubKey: Uint8Array;
  address: string;
  height: number;
  netId?: number;
  chainId?: number;
  msgType: string;
  typeUrl: string;
  inner: Uint8Array;
  fee: number;
}

/** Resolves true only when the tx was broadcast AND confirmed (not found in failed-txs). */
export async function signAndBroadcast(o: BroadcastOpts): Promise<boolean> {
  const toast = useToast.getState().show;
  try {
    const tx = await buildSigned(o.privKey, o.pubKey, o.msgType, o.typeUrl, o.inner, {
      fee: o.fee,
      height: o.height,
      netId: o.netId,
      chainId: o.chainId,
    });
    const hash = await submitTxRPC(tx);
    toast("⏳ Broadcasting — confirming in ~25s…");
    const res = await waitForConfirmation(o.address, hash);
    toast(res.message, !res.ok);
    return res.ok;
  } catch (e) {
    toast(friendlyError(null, e instanceof Error ? e.message : String(e)), true);
    return false;
  }
}
