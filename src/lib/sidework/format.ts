const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatCents(cents: number | null | undefined, opts?: { whole?: boolean }): string {
  if (cents === null || cents === undefined) return "—";
  const v = cents / 100;
  if (opts?.whole && Number.isInteger(v)) return usd0.format(v);
  return usd.format(v);
}

export function formatSignedCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  if (cents === 0) return "$0";
  return `${cents > 0 ? "+" : "−"}${formatCents(Math.abs(cents), { whole: true })}`;
}

export function formatPercent(p: number | null | undefined, digits = 2): string {
  if (p === null || p === undefined) return "—";
  return `${p.toFixed(digits)}%`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Formats a YYYY-MM-DD business date without timezone shifts. */
export function formatDate(iso: string | null | undefined, opts?: { weekday?: boolean; short?: boolean }): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  const full = MONTHS[mo - 1] ?? "";
  const month = opts?.short ? full.slice(0, 3) : full;
  const base = `${month} ${d}, ${y}`;
  if (!opts?.weekday) return base;
  const wd = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${wd}, ${base}`;
}

export function addDays(iso: string, n: number): string {
  const [y = 0, m = 0, d = 0] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay = 0, am = 0, ad = 0] = a.split("-").map(Number);
  const [by = 0, bm = 0, bd = 0] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
