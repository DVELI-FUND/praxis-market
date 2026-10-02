// Category & subcategory tree. Subs ride on-chain as [SUB:key] in rules.
export interface SubDef { key: string; label: string; icon: string }
export interface CatDef { key: string; label: string; icon: string; subs: SubDef[] }

export const CATS_TREE: CatDef[] = [
  { key: "crypto", label: "Crypto", icon: "crypto", subs: [
    { key: "bitcoin", label: "Bitcoin", icon: "bitcoin" },
    { key: "ethereum", label: "Ethereum", icon: "ethereum" },
    { key: "altcoins", label: "Altcoins", icon: "altcoins" },
    { key: "defi", label: "DeFi", icon: "defi" },
    { key: "etf", label: "ETFs & Flows", icon: "etf" } ] },
  { key: "sports", label: "Sports", icon: "sports", subs: [
    { key: "football", label: "Football", icon: "football" },
    { key: "basketball", label: "Basketball", icon: "basketball" },
    { key: "tennis", label: "Tennis", icon: "tennis" },
    { key: "f1", label: "F1 & Motorsport", icon: "f1" },
    { key: "ufc", label: "Combat Sports", icon: "ufc" },
    { key: "baseball", label: "Baseball", icon: "baseball" },
    { key: "hockey", label: "Hockey", icon: "hockey" },
    { key: "cricket", label: "Cricket", icon: "cricket" } ] },
  { key: "politics", label: "Politics", icon: "politics", subs: [
    { key: "elections", label: "Elections", icon: "elections" },
    { key: "policy", label: "Policy", icon: "policy" },
    { key: "geopolitics", label: "Geopolitics", icon: "geopolitics" } ] },
  { key: "finance", label: "Finance", icon: "finance", subs: [
    { key: "stocks", label: "Stocks", icon: "stocks" },
    { key: "macro", label: "Macro & Rates", icon: "macro" },
    { key: "commodities", label: "Commodities", icon: "commodities" },
    { key: "fx", label: "FX", icon: "fx" } ] },
  { key: "esports", label: "Esports", icon: "esports", subs: [
    { key: "lol", label: "League of Legends", icon: "lol" },
    { key: "cs2", label: "CS2", icon: "cs2" },
    { key: "dota2", label: "Dota 2", icon: "dota2" },
    { key: "valorant", label: "Valorant", icon: "valorant" },
    { key: "rl", label: "Rocket League", icon: "rl" } ] },
  { key: "other", label: "Other", icon: "other", subs: [
    { key: "culture", label: "Culture & Awards", icon: "culture" },
    { key: "science", label: "Science & Space", icon: "science" },
    { key: "weather", label: "Weather", icon: "weather" } ] },
];

export const SUB_RE = /\[SUB:([a-zA-Z0-9-]+)\]/;
export function buildRulesWithSub(sub: string, rules: string): string {
  const stripped = rules.replace(new RegExp(SUB_RE.source, "g"), "").trim();
  if (!sub) return stripped;
  return "[SUB:" + sub + "] " + stripped;
}
export function parseSub(rules: string): string | null {
  const m = rules.match(SUB_RE);
  return m ? m[1].toLowerCase() : null;
}
export const catDef = (k?: string | null) => CATS_TREE.find((c) => c.key === k);
export const subDef = (c?: string | null, s?: string | null) => catDef(c)?.subs.find((x) => x.key === s);
export const subLabel = (c?: string | null, s?: string | null) => subDef(c, s)?.label ?? (s ? s : "All");
