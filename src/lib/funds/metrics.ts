// NA-safe numeric helpers. Missing values ('--', '-', 'NA', '', null, NaN) are null,
// never 0. Display them as 'NA'.

const MISSING = new Set(['', '--', '-', '—', 'na', 'n/a', 'n.a.', 'null', 'undefined', '`']);

export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/,/g, '').replace(/%$/, '').trim();
  if (MISSING.has(s.toLowerCase())) return null;
  // Workbook notation: '--6.27' means -6.27 (bare '--' is NA).
  if (/^--(?=\d|\.)/.test(s)) s = '-' + s.slice(2);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isAvailable(v: unknown): boolean {
  return toNumberOrNull(v) !== null;
}

export function formatNumber(v: unknown, digits = 2, suffix = ''): string {
  const n = toNumberOrNull(v);
  return n === null ? 'NA' : `${n.toFixed(digits)}${suffix}`;
}

export function formatPercent(v: unknown, digits = 1, signed = false): string {
  const n = toNumberOrNull(v);
  if (n === null) return 'NA';
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/** Value for calculations where a missing input must count as 0 (per product rule). */
export function calcValue(v: unknown): number {
  return toNumberOrNull(v) ?? 0;
}

/** CAGR in percent from start/end values over years. Null on invalid input. */
export function cagr(start: unknown, end: unknown, years: unknown): number | null {
  const s = toNumberOrNull(start), e = toNumberOrNull(end), y = toNumberOrNull(years);
  if (s === null || e === null || y === null || s <= 0 || e <= 0 || y <= 0) return null;
  return (Math.pow(e / s, 1 / y) - 1) * 100;
}

/** Median of available values only. Null when none available. */
export function median(values: unknown[]): number | null {
  const nums = values.map(toNumberOrNull).filter((n): n is number => n !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const m = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2;
}
