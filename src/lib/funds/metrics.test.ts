import { describe, it, expect } from 'vitest';
import { toNumberOrNull, formatNumber, formatPercent, calcValue, cagr, median } from './metrics';
import { computeFreshness, inferPlanOption, toSchemeMeta } from './contracts';

describe('toNumberOrNull', () => {
  it('treats "--" as missing, not zero', () => expect(toNumberOrNull('--')).toBeNull());
  it.each(['', '-', 'NA', 'N/A', null, undefined, NaN, Infinity, 'abc', '12abc', true, {}])(
    'returns null for %p', (v) => expect(toNumberOrNull(v)).toBeNull());
  it('parses numbers with commas and %', () => {
    expect(toNumberOrNull('1,234.5')).toBe(1234.5);
    expect(toNumberOrNull('12.5%')).toBe(12.5);
    expect(toNumberOrNull('-3.2')).toBe(-3.2);
  });
  it('keeps real zero', () => expect(toNumberOrNull(0)).toBe(0));
});

describe('formatting', () => {
  it('shows NA for missing', () => {
    expect(formatNumber('--')).toBe('NA');
    expect(formatPercent(null)).toBe('NA');
  });
  it('formats values', () => {
    expect(formatNumber(1.234, 2)).toBe('1.23');
    expect(formatPercent(5, 1, true)).toBe('+5.0%');
  });
  it('calcValue uses 0 for missing', () => expect(calcValue('--')).toBe(0));
});

describe('cagr / median', () => {
  it('computes cagr', () => expect(cagr(100, 121, 2)!).toBeCloseTo(10, 6));
  it('rejects invalid cagr inputs', () => {
    expect(cagr(0, 100, 1)).toBeNull();
    expect(cagr(100, '--', 1)).toBeNull();
    expect(cagr(100, 110, 0)).toBeNull();
  });
  it('median ignores missing values', () => {
    expect(median([1, '--', 3, null])).toBe(2);
    expect(median(['--'])).toBeNull();
  });
});

describe('freshness', () => {
  const now = new Date('2026-10-16T00:00:00Z');
  it('fresh within 36h', () =>
    expect(computeFreshness(new Date('2026-10-15T12:00:00Z'), null, 'server-cache', now).status).toBe('fresh'));
  it('stale after 36h', () =>
    expect(computeFreshness(new Date('2026-10-10T00:00:00Z'), null, 'server-cache', now).status).toBe('stale'));
  it('expired when past expiresAt', () =>
    expect(computeFreshness(new Date('2026-10-15T23:00:00Z'), new Date('2026-10-15T23:30:00Z'), 'server-cache', now).status).toBe('expired'));
  it('unknown without timestamp', () =>
    expect(computeFreshness(null, null, 'none', now).status).toBe('unknown'));
});

describe('scheme meta', () => {
  it('infers plan/option from name', () => {
    expect(inferPlanOption('ABC Flexi Cap Fund Direct Growth')).toEqual({ plan: 'Direct', option: 'Growth' });
    expect(inferPlanOption('ABC Fund Regular IDCW')).toEqual({ plan: 'Regular', option: 'IDCW' });
    expect(inferPlanOption('ABC Fund')).toEqual({ plan: 'Unknown', option: 'Unknown' });
  });
  it('drops numeric category codes', () => {
    const m = toSchemeMeta({ id: 'x', name: 'X Fund', amc: 'X', category: '65' } as never);
    expect(m.categoryCode).toBeNull();
  });
});
