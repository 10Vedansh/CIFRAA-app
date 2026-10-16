// Shared fund-data contracts (Phase 1a). Additive: existing MutualFund type stays the
// runtime shape; these describe identity, provenance and freshness for new modules.
import type { MutualFund } from '@/types/mutualFund';

/** Current fund id is workbook-derived (name + row). Not an AMFI code or ISIN. */
export type SchemeIdSource = 'workbook-row' | 'amfi' | 'isin';

export interface SchemeId {
  id: string;
  source: SchemeIdSource;
}

export type PlanType = 'Direct' | 'Regular' | 'Unknown';
export type OptionType = 'Growth' | 'IDCW' | 'Unknown';

export interface SchemeMeta {
  id: SchemeId;
  name: string;
  amc: string;
  assetClass: string | null;
  categoryCode: string | null;
  plan: PlanType;
  option: OptionType;
}

export interface NavPoint {
  date: string; // ISO yyyy-mm-dd
  nav: number;
}

/** Where a displayed value came from. 'illustrative' must always be labelled in UI. */
export type DataProvenance = 'source' | 'derived' | 'illustrative' | 'unavailable';

export type FreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export interface DataFreshness {
  status: FreshnessStatus;
  lastUpdated: Date | null;
  expiresAt: Date | null;
  ageHours: number | null;
  source: 'server-cache' | 'local-cache' | 'legacy-api' | 'none';
}

export type FundDataError =
  | { kind: 'network'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'unknown'; message: string };

export const STALE_AFTER_HOURS = 36;

export function computeFreshness(
  lastUpdated: Date | null,
  expiresAt: Date | null,
  source: DataFreshness['source'],
  now: Date = new Date(),
): DataFreshness {
  if (!lastUpdated || isNaN(lastUpdated.getTime())) {
    return { status: 'unknown', lastUpdated: null, expiresAt, ageHours: null, source };
  }
  const ageHours = (now.getTime() - lastUpdated.getTime()) / 3_600_000;
  let status: FreshnessStatus = 'fresh';
  if (expiresAt && !isNaN(expiresAt.getTime()) && now > expiresAt) status = 'expired';
  else if (ageHours > STALE_AFTER_HOURS) status = 'stale';
  return { status, lastUpdated, expiresAt, ageHours, source };
}

/** Infer plan/option from scheme name only; returns Unknown when not explicit. */
export function inferPlanOption(name: string): { plan: PlanType; option: OptionType } {
  const n = name.toLowerCase();
  const plan: PlanType = /\bdirect\b/.test(n) ? 'Direct' : /\bregular\b/.test(n) ? 'Regular' : 'Unknown';
  const option: OptionType = /\b(idcw|dividend)\b/.test(n) ? 'IDCW' : /\bgrowth\b/.test(n) ? 'Growth' : 'Unknown';
  return { plan, option };
}

export function toSchemeMeta(f: MutualFund): SchemeMeta {
  const { plan, option } = inferPlanOption(f.name ?? '');
  const cat = typeof f.category === 'string' && f.category.trim() !== '' && !/^\d+$/.test(f.category.trim())
    ? f.category.trim()
    : null;
  return {
    id: { id: f.id, source: 'workbook-row' },
    name: f.name,
    amc: f.amc,
    assetClass: f.assetClass ?? null,
    categoryCode: cat,
    plan,
    option,
  };
}
