import { useWallet } from "@/store/wallet";
import { useMyResolver } from "@/lib/resolvers";
import { isAdminAddress } from "@/lib/admin";
import { useMarkets } from "@/hooks/useMarkets";

export function useRoles() {
  const wallet = useWallet((s) => s.praxisAddress);
  const myResolver = useMyResolver();
  const isResolver = myResolver !== null;

  // Creator = wallet has created at least one market (chain truth)
  const { data: markets = [] } = useMarkets();
  const isCreator = markets.some((m) => m.creator.toLowerCase() === String(wallet || "").toLowerCase());
  const isAdmin = isAdminAddress(wallet);

  return { isResolver, isCreator, isAdmin, hasAnyRole: isResolver || isCreator || isAdmin };
}
