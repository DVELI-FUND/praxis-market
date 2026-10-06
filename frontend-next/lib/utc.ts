// All user-entered dates/times in Praxis are UTC. Strings without an explicit
// zone ("2026-10-03T17:00", "datetime-local" values) are interpreted as UTC,
// never as the browser's local timezone.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseUTC(s: string): number {
  if (!s) return NaN;
  let t = String(s).trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += "T00:00";
  if (!HAS_ZONE.test(t)) t += "Z";
  return Date.parse(t);
}

// datetime-local compatible string (YYYY-MM-DDTHH:mm) in UTC, offset by ms from now.
export function utcInputValue(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 16);
}

export const fmtUTCDate = (ms: number, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(ms).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export const fmtUTCTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
