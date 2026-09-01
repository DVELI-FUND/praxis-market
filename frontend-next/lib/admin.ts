// Admin configuration — addresses with full access to protocol actions
// Create Market / Cancel Market / Builder Rewards / Settings

export const ADMIN_ADDRESSES = [
  "9333b025efecb6ee0329cbdc8fe87d7116e6303a",
];

export function isAdminAddress(address: string | null): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return ADMIN_ADDRESSES.some((a) => a.toLowerCase() === lower);
}
