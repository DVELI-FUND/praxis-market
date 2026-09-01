import { useWallet } from "@/store/wallet";
import { useMyResolver } from "@/lib/resolvers";
import { isAdminAddress } from "@/lib/admin";

export function useRoles() {
  const wallet = useWallet((s) => s.praxisAddress);
  const myResolver = useMyResolver();
  const isResolver = myResolver !== null;

  // Creator = wallet is a registered resolver (resolver_address arrives base64, decoded to hex in useMyResolver)
  const isCreator = !!myResolver;
  const isAdmin = isAdminAddress(wallet);

  return { isResolver, isCreator, isAdmin, hasAnyRole: isResolver || isCreator || isAdmin };
}
