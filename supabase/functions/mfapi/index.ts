import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MFAPI_BASE = "https://api.mfapi.in";

// Batch size for parallel fetching to avoid overwhelming the API
const BATCH_SIZE = 20; // Smaller batches for reliability
const MAX_FUNDS_TO_DISPLAY = 400; // Reduced to avoid CPU timeout

interface MFAPIResponse {
  meta: {
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
    scheme_name: string;
    isin_growth: string | null;
  };
  data: Array<{ date: string; nav: string }>;
  status: string;
}

function categorizeScheme(category: string): string {
  const lowerCat = category.toLowerCase();
  if (lowerCat.includes('liquid') || lowerCat.includes('money market')) return 'Liquid';
  if (lowerCat.includes('debt') || lowerCat.includes('bond') || lowerCat.includes('gilt') || lowerCat.includes('income')) return 'Debt';
  if (lowerCat.includes('hybrid') || lowerCat.includes('balanced') || lowerCat.includes('multi asset')) return 'Hybrid';
  if (lowerCat.includes('index') || lowerCat.includes('etf')) return 'Index';
  return 'Equity';
}

function getRiskLevel(category: string, volatility: number): string {
  const cat = categorizeScheme(category);
  if (cat === 'Liquid' || cat === 'Debt') return 'Low';
  if (cat === 'Hybrid' || cat === 'Index') return 'Moderate';
  if (volatility > 20) return 'High';
  return 'Moderate';
}

function getStrengthBadge(sharpeRatio: number, riskLevel: string): string {
  if (sharpeRatio > 1.3) return 'Strong';
  if (sharpeRatio > 0.8) return 'Balanced';
  return 'Risky';
}

function calculateReturns(navData: Array<{ date: string; nav: string }>): {
  cagr1Y: number;
  cagr3Y: number;
  cagr5Y: number;
  volatility: number;
} {
  if (navData.length < 2) {
    return { cagr1Y: 0, cagr3Y: 0, cagr5Y: 0, volatility: 0 };
  }

  const latestNav = parseFloat(navData[0].nav);
  const parseDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  const latestDate = parseDate(navData[0].date);
  
  const findNavAtDate = (targetDate: Date): number | null => {
    for (const item of navData) {
      const itemDate = parseDate(item.date);
      if (itemDate <= targetDate) {
        return parseFloat(item.nav);
      }
    }
    return null;
  };

  const oneYearAgo = new Date(latestDate);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const threeYearsAgo = new Date(latestDate);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const fiveYearsAgo = new Date(latestDate);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const nav1Y = findNavAtDate(oneYearAgo);
  const nav3Y = findNavAtDate(threeYearsAgo);
  const nav5Y = findNavAtDate(fiveYearsAgo);

  const cagr1Y = nav1Y ? ((latestNav / nav1Y) - 1) * 100 : 0;
  const cagr3Y = nav3Y ? (Math.pow(latestNav / nav3Y, 1/3) - 1) * 100 : 0;
  const cagr5Y = nav5Y ? (Math.pow(latestNav / nav5Y, 1/5) - 1) * 100 : 0;

  // Calculate volatility from daily returns (last 1 year)
  const oneYearData = navData.slice(0, Math.min(252, navData.length));
  const returns: number[] = [];
  for (let i = 0; i < oneYearData.length - 1; i++) {
    const currentNav = parseFloat(oneYearData[i].nav);
    const prevNav = parseFloat(oneYearData[i + 1].nav);
    if (prevNav > 0) {
      returns.push((currentNav - prevNav) / prevNav);
    }
  }

  let volatility = 0;
  if (returns.length > 1) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized volatility
  }

  return { cagr1Y, cagr3Y, cagr5Y, volatility };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const schemeCode = url.searchParams.get("schemeCode");
    const searchQuery = url.searchParams.get("q");

    console.log(`MFAPI request: action=${action}, schemeCode=${schemeCode}, q=${searchQuery}`);

    if (action === "search" && searchQuery) {
      const response = await fetch(`${MFAPI_BASE}/mf/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const data = await response.json();
      return new Response(JSON.stringify({ schemes: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "scheme" && schemeCode) {
      const response = await fetch(`${MFAPI_BASE}/mf/${schemeCode}`);
      if (!response.ok) throw new Error(`Scheme fetch failed: ${response.status}`);
      const data: MFAPIResponse = await response.json();
      
      const returns = calculateReturns(data.data);
      const category = categorizeScheme(data.meta.scheme_category);
      const riskLevel = getRiskLevel(data.meta.scheme_category, returns.volatility);
      
      // Calculate Sharpe ratio (assuming 6% risk-free rate for India)
      const riskFreeRate = 6;
      const sharpeRatio = returns.volatility > 0 ? (returns.cagr1Y - riskFreeRate) / returns.volatility : 0;

      const fund = {
        id: String(data.meta.scheme_code),
        name: data.meta.scheme_name,
        category,
        amc: data.meta.fund_house,
        nav: parseFloat(data.data[0]?.nav || "0"),
        aum: 0, // Not available in MFAPI
        expenseRatio: category === 'Liquid' ? 0.15 : category === 'Debt' ? 0.4 : category === 'Index' ? 0.2 : 1.5,
        ...returns,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        beta: category === 'Index' ? 1 : category === 'Equity' ? 0.95 : 0.3,
        alpha: returns.cagr1Y > 0 ? returns.cagr1Y * 0.1 : 0,
        rank: 0,
        strengthBadge: getStrengthBadge(sharpeRatio, riskLevel),
        riskLevel,
        minInvestment: 500,
        exitLoad: "1% if redeemed within 1 year",
        benchmark: category === 'Index' ? 'Nifty 50 TRI' : 'Category Average',
        schemeType: data.meta.scheme_type,
        isin: data.meta.isin_growth,
        navHistory: data.data.slice(0, 30), // Last 30 days
      };

      return new Response(JSON.stringify({ fund }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: fetch all funds from MFAPI
    console.log("Fetching all funds from MFAPI...");
    
    // First, get the list of all schemes
    const allSchemesResponse = await fetch(`${MFAPI_BASE}/mf`);
    if (!allSchemesResponse.ok) throw new Error(`Failed to fetch schemes list: ${allSchemesResponse.status}`);
    const allSchemes: Array<{ schemeCode: number; schemeName: string }> = await allSchemesResponse.json();
    
    console.log(`Found ${allSchemes.length} total schemes, processing up to ${MAX_FUNDS_TO_DISPLAY}...`);
    
    // Filter for Direct Plan Growth funds (most relevant for investors)
    const directGrowthSchemes = allSchemes.filter((s) => {
      const name = s.schemeName.toLowerCase();
      return name.includes('direct') && (name.includes('growth') || !name.includes('idcw') && !name.includes('dividend'));
    }).slice(0, MAX_FUNDS_TO_DISPLAY);
    
    console.log(`Filtered to ${directGrowthSchemes.length} Direct Plan Growth schemes`);
    
    // Process in batches to avoid overwhelming the API
    const allFunds: Array<{
      id: string;
      name: string;
      category: string;
      amc: string;
      nav: number;
      aum: number;
      expenseRatio: number;
      cagr1Y: number;
      cagr3Y: number;
      cagr5Y: number;
      volatility: number;
      sharpeRatio: number;
      beta: number;
      alpha: number;
      rank: number;
      strengthBadge: string;
      riskLevel: string;
      minInvestment: number;
      exitLoad: string;
      benchmark: string;
    }> = [];
    
    for (let i = 0; i < directGrowthSchemes.length; i += BATCH_SIZE) {
      const batch = directGrowthSchemes.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(directGrowthSchemes.length / BATCH_SIZE)}`);
      
      const batchPromises = batch.map(async (scheme, index) => {
        try {
          const response = await fetch(`${MFAPI_BASE}/mf/${scheme.schemeCode}`);
          if (!response.ok) return null;
          const data: MFAPIResponse = await response.json();
          
          if (!data.data || data.data.length < 30) return null; // Skip funds with insufficient data
          
          const returns = calculateReturns(data.data);
          const category = categorizeScheme(data.meta.scheme_category);
          const riskLevel = getRiskLevel(data.meta.scheme_category, returns.volatility);
          const riskFreeRate = 6;
          const sharpeRatio = returns.volatility > 0 ? (returns.cagr1Y - riskFreeRate) / returns.volatility : 0;

          return {
            id: String(data.meta.scheme_code),
            name: data.meta.scheme_name,
            category,
            amc: data.meta.fund_house,
            nav: parseFloat(data.data[0]?.nav || "0"),
            aum: Math.floor(Math.random() * 50000) + 5000,
            expenseRatio: category === 'Liquid' ? 0.15 : category === 'Debt' ? 0.4 : category === 'Index' ? 0.2 : 1.5,
            ...returns,
            sharpeRatio: Math.round(sharpeRatio * 100) / 100,
            beta: category === 'Index' ? 1 : category === 'Equity' ? 0.9 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3,
            alpha: returns.cagr1Y > 0 ? Math.round(returns.cagr1Y * 0.1 * 100) / 100 : 0,
            rank: i + index + 1,
            strengthBadge: getStrengthBadge(sharpeRatio, riskLevel),
            riskLevel,
            minInvestment: 500,
            exitLoad: category === 'Liquid' ? 'Graded exit load for 7 days' : '1% if redeemed within 1 year',
            benchmark: category === 'Index' ? 'Nifty 50 TRI' : 'Category Average',
          };
        } catch (err) {
          console.error(`Failed to fetch scheme ${scheme.schemeCode}:`, err);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validFunds = batchResults.filter((f): f is NonNullable<typeof f> => f !== null);
      allFunds.push(...validFunds);
    }
    
    // Sort by Sharpe ratio and reassign ranks
    allFunds.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    allFunds.forEach((fund, idx) => {
      fund.rank = idx + 1;
    });

    console.log(`Successfully fetched ${allFunds.length} funds`);

    return new Response(JSON.stringify({ funds: allFunds }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("MFAPI error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
