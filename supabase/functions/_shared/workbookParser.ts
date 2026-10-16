// Header-driven workbook parser shared by process-workbook and sync-onedrive.
// Pure TypeScript (no Deno / XLSX imports) so it can be unit-tested in Vitest.
// Callers convert each sheet to rows with XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).
//
// Rules:
// - Fields are matched by verified header text, never by column position.
// - '--' alone means "not available" (null). '--6.27' is the workbook's notation for -6.27.
// - Categories are accepted only when they are a recognised code; otherwise the row is flagged
//   and category is left null (never guessed).
// - Fund ids keep the legacy formula (sanitised name + sheet row index) so existing
//   watchlist / portfolio references stay valid.

export type AssetClass = 'Equity' | 'Debt' | 'Hybrid' | 'Commodities';

export interface ParseIssue {
  sheet: string;
  row: number; // 0-based row index in sheet (header = 0)
  name: string | null;
  reason: string;
}

export interface ParseResult {
  funds: Record<string, unknown>[];
  issues: ParseIssue[];
  unmappedHeaders: Record<string, string[]>;
  missingRequiredHeaders: Record<string, string[]>;
}

/** Normalised header text -> field key. */
export const HEADER_MAP: Record<string, string> = {
  'funds': 'name',
  'fund': 'name',
  'scheme name': 'name',
  'category': 'category',
  'launch': 'launch',
  'net assets (cr)': 'netAssets',
  'market cap': 'marketCap',
  '1 wk ret (%)': 'ret1W',
  '1 mth ret (%)': 'ret1M',
  '3 mth ret (%)': 'ret3M',
  '6 mth ret (%)': 'ret6M',
  '1 yr ret (%)': 'ret1Y',
  '3 yr ret (%)': 'ret3Y',
  '5 yr ret (%)': 'ret5Y',
  '10 yr ret (%)': 'ret10Y',
  'latest nav': 'latestNav',
  'previous nav': 'previousNav',
  '52-week high nav': 'high52W',
  '52-week low nav': 'low52W',
  'expense ratio (%)': 'expenseRatio',
  'turnover': 'turnover',
  'standard deviation': 'stdDev',
  'sharpe ratio': 'sharpeRatio',
  'sortino ratio': 'sortinoRatio',
  'beta': 'beta',
  'alpha': 'alpha',
  'information ratio': 'infoRatio',
  'r-squared': 'rSquared',
  'avg. credit quality': 'avgCreditQuality',
  'avg. maturity (yrs)': 'avgMaturity',
  'yield to maturity (%)': 'ytm',
  'minimum investment': 'minInvestment',
  'exit load (period)': 'exitLoad',
  'fund manager (tenure)': 'fundManager',
};

const REQUIRED_HEADERS = ['name', 'category', 'latestNav'];
const TEXT_FIELDS = new Set(['name', 'category', 'fundManager', 'avgCreditQuality']);

const CATEGORY_PATTERN = /^(EQ|DT|HY)-[A-Za-z0-9&. -]+$|^(Gold|Silver)-Funds$/;
const CATEGORY_PREFIX: Record<AssetClass, RegExp> = {
  Equity: /^EQ-/,
  Debt: /^DT-/,
  Hybrid: /^HY-/,
  Commodities: /^(Gold|Silver)-Funds$/,
};

export function normaliseHeader(h: unknown): string {
  return String(h ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function assetClassForSheet(sheetName: string): AssetClass | null {
  const n = sheetName.trim().toLowerCase();
  if (n.startsWith('equity')) return 'Equity';
  if (n.startsWith('debt')) return 'Debt';
  if (n.startsWith('hybrid')) return 'Hybrid';
  if (n.startsWith('commodit')) return 'Commodities';
  return null;
}

/** Workbook numeric cell -> number | null. '--' = NA; '--X' = -X. */
export function parseWorkbookNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  let s = String(val).replace(/,/g, '').trim();
  if (s === '' || s === '`' || /^(-+|—|n\/?a|n\.a\.)$/i.test(s)) return null;
  let sign = 1;
  const m = s.match(/^-{2}(?=\d|\.)/);
  if (m) { sign = -1; s = s.slice(2); }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s) * sign;
  return Number.isFinite(n) ? n : null;
}

export function parseLaunchDate(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  const str = String(val).replace(/,/g, '').trim();
  if (str === '' || /^(-+|n\/?a)$/i.test(str)) return null;
  const serial = Number(str);
  if (Number.isFinite(serial) && serial > 59 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // workbook uses MM/DD/YYYY
  if (mdy) {
    const d = new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return str;
}

function parseExitLoad(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val).trim();
  if (!s || /^-+$/.test(s)) return 'Nil';
  return s;
}

function textOrNull(val: unknown): string | null {
  const s = val === null || val === undefined ? '' : String(val).trim();
  return s === '' || /^-+$/.test(s) ? null : s;
}

export function getRiskLevel(category: string, stdDev: number | null): string {
  const cat = String(category).toLowerCase();
  if (cat.includes('liq') || cat.includes('overnht') || cat.includes('mm')) return 'Low';
  if (cat.includes('dt-')) return stdDev && stdDev > 5 ? 'Moderate' : 'Low';
  if (cat.includes('hy-')) return stdDev && stdDev > 12 ? 'High' : 'Moderate';
  if (cat.includes('gold') || cat.includes('silver')) return 'Moderate';
  if (stdDev && stdDev > 18) return 'High';
  return 'Moderate';
}

export function getStrengthBadge(sharpe: number | null): string {
  if (!sharpe) return 'Balanced';
  if (sharpe > 1.3) return 'Strong';
  if (sharpe > 0.7) return 'Balanced';
  return 'Risky';
}

export function generateId(name: string, index: number): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '_' + index;
}

export function extractAmc(name: string): string {
  const pattern = /^(.*?)\s+(Liquid|Overnight|Money|Corporate|Credit|Gilt|Dynamic|Short|Medium|Long|Ultra|Floating|Banking|Arbitrage|Balanced|Aggressive|Conservative|Equity|Flexi|Multi|Large|Mid|Small|ELSS|Index|Nifty|BSE|Gold|Silver|ETF|FoF|Fund|Focused|Dividend|Value|Contra|Infrastructure|Healthcare|Digital|Consumption|Energy|PSU|IT|Pharma|Thematic|Sectoral|Innovation|Business|Quant|ESG)/i;
  const match = name.match(pattern);
  if (match && match[1]) {
    const amc = match[1].trim().replace(/\s*-\s*$/, '').trim();
    if (amc.length > 3) return amc;
  }
  return name.split(/\s+/).slice(0, 3).join(' ');
}

export function isValidCategory(cat: string | null, assetClass: AssetClass): boolean {
  return !!cat && CATEGORY_PATTERN.test(cat) && CATEGORY_PREFIX[assetClass].test(cat);
}

export function parseSheetRows(sheetName: string, rows: unknown[][], out: ParseResult): void {
  const assetClass = assetClassForSheet(sheetName);
  if (!assetClass) {
    out.issues.push({ sheet: sheetName, row: 0, name: null, reason: 'Unrecognised sheet name; skipped' });
    return;
  }
  const header = (rows[0] ?? []) as unknown[];
  const colToField: (string | null)[] = header.map((h) => HEADER_MAP[normaliseHeader(h)] ?? null);
  const unmapped = header
    .map((h, i) => (colToField[i] ? null : String(h ?? '').trim()))
    .filter((h): h is string => !!h);
  if (unmapped.length) out.unmappedHeaders[sheetName] = unmapped;
  const present = new Set(colToField.filter(Boolean));
  const missing = REQUIRED_HEADERS.filter((f) => !present.has(f));
  if (missing.length) {
    out.missingRequiredHeaders[sheetName] = missing;
    out.issues.push({ sheet: sheetName, row: 0, name: null, reason: `Missing required headers: ${missing.join(', ')}; sheet skipped` });
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row) continue;
    const fund: Record<string, unknown> = { assetClass };
    colToField.forEach((field, j) => {
      if (!field) return;
      const val = row[j];
      if (field === 'launch') fund.launch = parseLaunchDate(val);
      else if (field === 'exitLoad') fund.exitLoad = parseExitLoad(val);
      else if (TEXT_FIELDS.has(field)) fund[field] = textOrNull(val);
      else fund[field] = parseWorkbookNumber(val);
    });

    const name = fund.name as string | null;
    if (!name) continue; // blank row
    if (name.includes('→') || name.includes('🔹') || name.includes('🔸') || name.length <= 5) continue;

    const category = fund.category as string | null;
    if (!isValidCategory(category, assetClass)) {
      out.issues.push({ sheet: sheetName, row: i, name, reason: `Unrecognised category "${category ?? ''}" for ${assetClass}; category left empty` });
      fund.category = null;
      fund.categoryFlagged = true;
    }

    const stdDev = fund.stdDev as number | null;
    fund.id = generateId(name, i);
    fund.amc = extractAmc(name);
    fund.riskLevel = getRiskLevel((fund.category as string) || '', stdDev ?? null);
    fund.strengthBadge = getStrengthBadge((fund.sharpeRatio as number | null) ?? null);
    fund.nav = (fund.latestNav as number | null) || 0;
    fund.aum = (fund.netAssets as number | null) || 0;
    fund.cagr1Y = fund.ret1Y ?? null;
    fund.cagr3Y = fund.ret3Y ?? null;
    fund.cagr5Y = fund.ret5Y ?? null;
    fund.volatility = stdDev ?? null;
    fund.minInvestment = (fund.minInvestment as number | null) || 500;
    fund.rank = 0;
    fund.benchmark = '';
    out.funds.push(fund);
  }
}

/** Parses all sheets and assigns Sharpe rank within each asset class. */
export function parseWorkbookSheets(sheets: { name: string; rows: unknown[][] }[]): ParseResult {
  const out: ParseResult = { funds: [], issues: [], unmappedHeaders: {}, missingRequiredHeaders: {} };
  for (const s of sheets) parseSheetRows(s.name, s.rows, out);
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const f of out.funds) (groups[f.assetClass as string] ??= []).push(f);
  for (const list of Object.values(groups)) {
    [...list]
      .sort((a, b) => ((b.sharpeRatio as number) || 0) - ((a.sharpeRatio as number) || 0))
      .forEach((f, idx) => { f.rank = idx + 1; });
  }
  return out;
}
