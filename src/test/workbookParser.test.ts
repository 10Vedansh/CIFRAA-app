import { describe, it, expect } from 'vitest';
import {
  parseWorkbookNumber,
  parseLaunchDate,
  parseWorkbookSheets,
  generateId,
} from '../../supabase/functions/_shared/workbookParser';

// Representative rows copied from the real workbook (Data_1.xlsx).
const EQUITY_HEADER = ['Funds', 'Category', 'Launch', 'Net Assets (Cr)', '1 Wk Ret (%)', '1 Mth Ret (%)', '3 Mth Ret (%)', '6 Mth Ret (%)', '1 Yr Ret (%)', '3 Yr Ret (%)', '5 Yr Ret (%)', '10 Yr Ret (%)', 'Latest NAV', 'Previous NAV', '52-Week High NAV', '52-Week Low NAV', 'Expense Ratio (%)', 'Turnover', 'Standard Deviation', 'Sharpe Ratio', 'Sortino Ratio', 'Beta', 'Alpha', 'Minimum Investment', 'Exit Load (Period)', 'Fund Manager (Tenure)'];
const EQUITY_ROW = ['360 ONE Flexicap Fund - Direct Plan', 'EQ-FLX', new Date(Date.UTC(2023, 5, 30)), 1787, 0.11, 9.94, '--1.62', '--3.95', 5.17, '--', '--', '--', 15.4, 15.28, 16.15, 13.71, 1.07, 51, '--', '--', '--', '--', '--', 1000, '1.00 (365)', 'Mayur Patel (2.9)'];
const DEBT_HEADER = ['Funds', 'Standard Deviation', 'Beta', 'Sharpe Ratio', 'Sortino Ratio', 'Alpha', 'Category', 'Launch', 'Net Assets (Cr)', 'Avg. Credit Quality', 'Avg. Maturity (Yrs)', 'Yield to Maturity (%)', '1 Wk Ret (%)', '1 Mth Ret (%)', '3 Mth Ret (%)', '6 Mth Ret (%)', '1 Yr Ret (%)', '3 Yr Ret (%)', '5 Yr Ret (%)', '10 Yr Ret (%)', 'Latest NAV', 'Previous NAV', '52-Week High NAV', '52-Week Low NAV', 'Expense Ratio (%)', 'Minimum Investment', 'Exit Load (Period)', 'Fund Manager (Tenure)'];
const DEBT_ROW = ['360 ONE Liquid Fund - Direct Plan', 0.19, '--', 3.65, 5.27, '--', 'DT-LIQ', new Date(Date.UTC(2013, 10, 13)), 1177, 'AAA', 0.16, 7.18, 0.09, 0.55, 1.62, 3.09, 6.15, 6.82, 5.92, 5.77, 2126.128, 2125.815, 2126.128, 2003.35, 0.23, 5000, '0.01 (1)', 'Viral Mehta (0.6)'];

describe('parseWorkbookNumber', () => {
  it('treats bare "--" as NA', () => expect(parseWorkbookNumber('--')).toBeNull());
  it('reads "--6.27" as -6.27', () => expect(parseWorkbookNumber('--6.27')).toBe(-6.27));
  it('keeps plain numbers and zero', () => {
    expect(parseWorkbookNumber(5.17)).toBe(5.17);
    expect(parseWorkbookNumber(0)).toBe(0);
    expect(parseWorkbookNumber('1,234.5')).toBe(1234.5);
  });
  it.each(['', '`', 'N/A', 'abc', null, undefined, NaN])('null for %p', (v) =>
    expect(parseWorkbookNumber(v)).toBeNull());
});

describe('parseLaunchDate', () => {
  it('Excel serial 41275 -> 2013-01-01', () => expect(parseLaunchDate(41275)).toBe('2013-01-01'));
  it('MM/DD/YYYY', () => expect(parseLaunchDate('06/30/2023')).toBe('2023-06-30'));
  it('NA', () => expect(parseLaunchDate('--')).toBeNull());
});

describe('parseWorkbookSheets', () => {
  const res = parseWorkbookSheets([
    { name: 'Equity', rows: [EQUITY_HEADER, EQUITY_ROW] },
    { name: 'Debt', rows: [DEBT_HEADER, DEBT_ROW] },
  ]);
  const eq = res.funds.find((f) => f.assetClass === 'Equity')!;
  const dt = res.funds.find((f) => f.assetClass === 'Debt')!;

  it('maps equity category by header, not position', () => {
    expect(eq.category).toBe('EQ-FLX');
    expect(eq.netAssets).toBe(1787);
    expect(eq.aum).toBe(1787);
  });
  it('keeps negatives and NA in returns', () => {
    expect(eq.ret3M).toBe(-1.62);
    expect(eq.ret3Y).toBeNull();
    expect(eq.cagr3Y).toBeNull();
    expect(eq.sharpeRatio).toBeNull();
  });
  it('maps debt fields', () => {
    expect(dt.category).toBe('DT-LIQ');
    expect(dt.ytm).toBe(7.18);
    expect(dt.nav).toBe(2126.128);
    expect(dt.launch).toBe('2013-11-13');
  });
  it('keeps the legacy id formula', () =>
    expect(eq.id).toBe(generateId('360 ONE Flexicap Fund - Direct Plan', 1)));
  it('produces no issues for valid rows', () => expect(res.issues).toEqual([]));

  it('flags a numeric category instead of guessing', () => {
    const bad = [...EQUITY_ROW]; bad[1] = '65';
    const r = parseWorkbookSheets([{ name: 'Equity', rows: [EQUITY_HEADER, bad] }]);
    expect(r.funds[0].category).toBeNull();
    expect(r.issues).toHaveLength(1);
  });
  it('flags a category from the wrong asset class', () => {
    const bad = [...EQUITY_ROW]; bad[1] = 'DT-LIQ';
    const r = parseWorkbookSheets([{ name: 'Equity', rows: [EQUITY_HEADER, bad] }]);
    expect(r.funds[0].category).toBeNull();
  });
  it('skips a sheet missing required headers', () => {
    const r = parseWorkbookSheets([{ name: 'Equity', rows: [['Funds', 'Beta'], ['Some Long Fund Name', 1]] }]);
    expect(r.funds).toHaveLength(0);
    expect(r.missingRequiredHeaders.Equity).toEqual(['category', 'latestNav']);
  });
  it('works when columns are reordered', () => {
    const order = [...EQUITY_HEADER.keys()].reverse();
    const r = parseWorkbookSheets([{ name: 'Equity', rows: [order.map((i) => EQUITY_HEADER[i]), order.map((i) => EQUITY_ROW[i])] }]);
    expect(r.funds[0].category).toBe('EQ-FLX');
    expect(r.funds[0].latestNav).toBe(15.4);
  });
});
