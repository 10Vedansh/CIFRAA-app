import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, requireAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Updated column mappings matching the new Excel structure
const EQUITY_COLS = [
  'name', 'beta', 'alpha', 'category', 'launch', 'netAssets', 'marketCap',
  'ret1W', 'ret1M', 'ret3M', 'ret6M', 'ret1Y', 'ret3Y', 'ret5Y', 'ret10Y',
  'latestNav', 'previousNav', 'high52W', 'low52W',
  'expenseRatio', 'turnover', 'stdDev', 'sharpeRatio', 'sortinoRatio',
  'minInvestment', 'exitLoad', 'fundManager',
];

const DEBT_COLS = [
  'name', 'stdDev', 'beta', 'sharpeRatio', 'sortinoRatio', 'alpha',
  'category', 'launch', 'netAssets', 'avgCreditQuality', 'avgMaturity', 'ytm',
  'ret1W', 'ret1M', 'ret3M', 'ret6M', 'ret1Y', 'ret3Y', 'ret5Y', 'ret10Y',
  'latestNav', 'previousNav', 'high52W', 'low52W',
  'expenseRatio', 'minInvestment', 'exitLoad', 'fundManager',
];

const HYBRID_COLS = [
  'name', 'stdDev', 'sharpeRatio', 'sortinoRatio', 'beta', 'alpha',
  'category', 'launch', 'netAssets', 'avgCreditQuality', 'avgMaturity', 'ytm', 'marketCap',
  'ret1W', 'ret1M', 'ret3M', 'ret6M', 'ret1Y', 'ret3Y', 'ret5Y', 'ret10Y',
  'latestNav', 'previousNav', 'high52W', 'low52W',
  'expenseRatio', 'minInvestment', 'exitLoad', 'fundManager',
];

const COMMODITY_COLS = [
  'name', 'category', 'launch', 'netAssets',
  'ret1W', 'ret1M', 'ret3M', 'ret6M', 'ret1Y', 'ret3Y', 'ret5Y', 'ret10Y',
  'latestNav', 'previousNav', 'high52W', 'low52W',
  'expenseRatio', 'turnover', 'stdDev', 'sharpeRatio', 'sortinoRatio', 'beta', 'alpha',
  'minInvestment', 'exitLoad', 'fundManager',
];

const SHEET_CONFIG = [
  { name: 'Equity', cols: EQUITY_COLS, assetClass: 'Equity' },
  { name: 'Debt', cols: DEBT_COLS, assetClass: 'Debt' },
  { name: 'Hybrid', cols: HYBRID_COLS, assetClass: 'Hybrid' },
  { name: 'Commodities', cols: COMMODITY_COLS, assetClass: 'Commodities' },
];

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '--' || val === '-' || val === 'N/A') return null;
  const str = String(val).replace(/,/g, '').trim();
  if (str === '`') return null; // handle backtick
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseExitLoad(val: unknown): string {
  if (!val || val === '--' || val === '-') return 'Nil';
  return String(val).trim();
}

function parseLaunchDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '' || val === '--' || val === '-' || val === 'N/A') return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  const str = String(val).replace(/,/g, '').trim();
  const serial = Number(str);
  if (Number.isFinite(serial) && serial > 59 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return String(val).trim();
}

function getRiskLevel(category: string, stdDev: number | null): string {
  const cat = String(category).toLowerCase();
  if (cat.includes('liq') || cat.includes('overnht') || cat.includes('mm')) return 'Low';
  if (cat.includes('dt-') || cat.includes('debt')) {
    if (stdDev && stdDev > 5) return 'Moderate';
    return 'Low';
  }
  if (cat.includes('hy-')) {
    if (stdDev && stdDev > 12) return 'High';
    return 'Moderate';
  }
  if (cat.includes('gold') || cat.includes('silver')) return 'Moderate';
  if (stdDev && stdDev > 18) return 'High';
  if (stdDev && stdDev > 12) return 'Moderate';
  return 'Moderate';
}

function getStrengthBadge(sharpe: number | null): string {
  if (!sharpe) return 'Balanced';
  if (sharpe > 1.3) return 'Strong';
  if (sharpe > 0.7) return 'Balanced';
  return 'Risky';
}

function generateId(name: string, index: number): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '_' + index;
}

function extractAmc(name: string): string {
  const patterns = [
    /^(.*?)\s+(Liquid|Overnight|Money|Corporate|Credit|Gilt|Dynamic|Short|Medium|Long|Ultra|Floating|Banking|Arbitrage|Balanced|Aggressive|Conservative|Equity|Flexi|Multi|Large|Mid|Small|ELSS|Index|Nifty|BSE|Gold|Silver|ETF|FoF|Fund|Focused|Dividend|Value|Contra|Infrastructure|Healthcare|Digital|Consumption|Energy|PSU|IT|Pharma|Thematic|Sectoral|Innovation|Business|Quant|ESG)/i
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1]) {
      let amc = match[1].trim();
      amc = amc.replace(/\s*-\s*$/, '').trim();
      if (amc.length > 3) return amc;
    }
  }
  
  const words = name.split(/\s+/);
  return words.slice(0, 3).join(' ');
}

function processSheet(worksheet: XLSX.WorkSheet, colMapping: string[], assetClass: string): any[] {
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const funds: any[] = [];
  
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (!row || !row[0] || String(row[0]).trim() === '') continue;
    
    const name = String(row[0]).trim();
    if (name.includes('→') || name.includes('🔹') || name.includes('🔸')) continue;
    
    const fund: Record<string, any> = { assetClass };
    
    for (let j = 0; j < colMapping.length && j < row.length; j++) {
      const key = colMapping[j];
      const val = row[j];
      
      if (key === 'name') {
        fund.name = String(val).trim();
      } else if (key === 'category') {
        fund.category = String(val).trim();
      } else if (key === 'launch') {
        fund.launch = parseLaunchDate(val);
      } else if (key === 'fundManager') {
        fund.fundManager = val ? String(val).trim() : null;
      } else if (key === 'exitLoad') {
        fund.exitLoad = parseExitLoad(val);
      } else if (key === 'avgCreditQuality') {
        fund.avgCreditQuality = val ? String(val).trim() : null;
      } else {
        fund[key] = parseNumber(val);
      }
    }
    
    if (fund.name && fund.name.length > 5) {
      fund.id = generateId(fund.name, i);
      fund.amc = extractAmc(fund.name);
      fund.riskLevel = getRiskLevel(fund.category || '', fund.stdDev);
      fund.strengthBadge = getStrengthBadge(fund.sharpeRatio);
      
      // Map to unified fields - use null instead of 0 for missing data
      fund.nav = fund.latestNav || 0;
      fund.aum = fund.netAssets || 0;
      fund.cagr1Y = fund.ret1Y ?? null;
      fund.cagr3Y = fund.ret3Y ?? null;
      fund.cagr5Y = fund.ret5Y ?? null;
      fund.volatility = fund.stdDev ?? null;
      fund.minInvestment = fund.minInvestment || 500;
      fund.rank = 0;
      fund.benchmark = '';
      
      // Keep beta, alpha, sharpeRatio, sortinoRatio as-is (null if missing)
      
      funds.push(fund);
    }
  }
  
  return funds;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Downloading workbook from storage...");
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('data-files')
      .download('Data.xlsx');

    if (downloadError || !fileData) {
      throw new Error(`Failed to download workbook: ${downloadError?.message || 'No data'}`);
    }

    console.log("Parsing workbook...");
    
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(bytes, { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellStyles: false });
    
    console.log(`Workbook has ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);

    const allFunds: any[] = [];
    
    for (let sheetIndex = 0; sheetIndex < Math.min(workbook.SheetNames.length, SHEET_CONFIG.length); sheetIndex++) {
      const sheetName = workbook.SheetNames[sheetIndex];
      const config = SHEET_CONFIG[sheetIndex];
      const worksheet = workbook.Sheets[sheetName];
      
      console.log(`Processing sheet: ${sheetName} (${config.assetClass})`);
      
      const funds = processSheet(worksheet, config.cols, config.assetClass);
      console.log(`  → ${funds.length} funds parsed`);
      allFunds.push(...funds);
    }

    // Sort by Sharpe ratio and assign ranks within each asset class
    const byAssetClass: Record<string, any[]> = {};
    for (const fund of allFunds) {
      if (!byAssetClass[fund.assetClass]) byAssetClass[fund.assetClass] = [];
      byAssetClass[fund.assetClass].push(fund);
    }
    
    for (const [assetClass, funds] of Object.entries(byAssetClass)) {
      funds.sort((a, b) => (b.sharpeRatio || 0) - (a.sharpeRatio || 0));
      funds.forEach((fund, idx) => { fund.rank = idx + 1; });
    }

    console.log(`Total funds processed: ${allFunds.length}`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    await supabase.from('fund_cache').delete().eq('cache_key', 'workbook_data');
    const { error: insertError } = await supabase
      .from('fund_cache')
      .insert({
        cache_key: 'workbook_data',
        data: allFunds,
        last_updated: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      throw new Error(`Failed to save to cache: ${insertError.message}`);
    }

    await supabase.from('fund_cache').delete().eq('cache_key', 'mf_data');
    await supabase.from('fund_cache').insert({
      cache_key: 'mf_data',
      data: allFunds,
      last_updated: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    console.log("Workbook data cached successfully!");

    return new Response(JSON.stringify({
      success: true,
      totalFunds: allFunds.length,
      byAssetClass: Object.fromEntries(
        Object.entries(byAssetClass).map(([k, v]) => [k, v.length])
      ),
      lastUpdated: now.toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Process workbook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
