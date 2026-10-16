import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

// Parse AMFI NAV data to get latest NAVs by fund name
async function fetchLatestNAVs(): Promise<Map<string, { nav: number; date: string }>> {
  const navMap = new Map<string, { nav: number; date: string }>();
  
  try {
    const response = await fetch(AMFI_NAV_URL);
    if (!response.ok) return navMap;
    
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('Scheme Code;') || !trimmed.includes(';')) continue;
      
      const parts = trimmed.split(';');
      if (parts.length >= 6) {
        const schemeName = parts[3]?.trim();
        const navStr = parts[4]?.trim();
        const navDate = parts[5]?.trim();
        
        if (!schemeName || !navStr || navStr === 'N.A.' || navStr === '-') continue;
        
        const nav = parseFloat(navStr);
        if (isNaN(nav) || nav <= 0) continue;
        
        // Store by normalized name for matching
        const normalizedName = schemeName.toLowerCase().replace(/\s+/g, ' ').trim();
        navMap.set(normalizedName, { nav, date: navDate });
      }
    }
    
    console.log(`Fetched ${navMap.size} NAVs from AMFI`);
  } catch (err) {
    console.error("Failed to fetch AMFI NAVs:", err);
  }
  
  return navMap;
}

// Enrich workbook funds with latest AMFI NAV
function enrichWithAMFI(funds: any[], navMap: Map<string, { nav: number; date: string }>): any[] {
  let enriched = 0;
  
  for (const fund of funds) {
    const normalizedName = fund.name?.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalizedName) continue;
    
    // Try exact match first
    let match = navMap.get(normalizedName);
    
    // Try partial matching if exact fails
    if (!match) {
      for (const [key, val] of navMap) {
        if (key.includes(normalizedName) || normalizedName.includes(key)) {
          match = val;
          break;
        }
      }
    }
    
    if (match) {
      fund.previousNav = fund.latestNav || fund.nav;
      fund.latestNav = match.nav;
      fund.nav = match.nav;
      fund.navDate = match.date;
      enriched++;
    }
  }
  
  console.log(`Enriched ${enriched}/${funds.length} funds with AMFI NAV`);
  return funds;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "cached";
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`Fetch fund data request: action=${action}`);
    
    if (action === "check") {
      const { data: cache, error } = await supabase
        .from('fund_cache')
        .select('last_updated, expires_at')
        .eq('cache_key', 'workbook_data')
        .single();
      
      if (error || !cache) {
        // Fallback to old mf_data cache
        const { data: oldCache } = await supabase
          .from('fund_cache')
          .select('last_updated, expires_at')
          .eq('cache_key', 'mf_data')
          .single();
        
        return new Response(JSON.stringify({ 
          needsRefresh: !oldCache,
          lastUpdated: oldCache?.last_updated,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ 
        needsRefresh: false,
        lastUpdated: cache.last_updated,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (action === "cached") {
      // Try workbook_data first, then fall back to mf_data
      let cacheResult = await supabase
        .from('fund_cache')
        .select('data, last_updated')
        .eq('cache_key', 'workbook_data')
        .single();
      
      if (cacheResult.error || !cacheResult.data) {
        cacheResult = await supabase
          .from('fund_cache')
          .select('data, last_updated')
          .eq('cache_key', 'mf_data')
          .single();
      }
      
      if (cacheResult.error || !cacheResult.data) {
        return new Response(JSON.stringify({ 
          funds: [],
          error: 'No cache available'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ 
        funds: cacheResult.data.data,
        lastUpdated: cacheResult.data.last_updated,
        source: 'cache'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (action !== "full") {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Full refresh overwrites shared fund data: administrators / service only.
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    // Full refresh: Read workbook data from cache + supplement with AMFI daily NAV
    console.log("Starting full data refresh...");
    
    // Step 1: Get workbook data from cache
    let { data: workbookCache } = await supabase
      .from('fund_cache')
      .select('data, last_updated')
      .eq('cache_key', 'workbook_data')
      .single();
    
    if (!workbookCache || !workbookCache.data) {
      // Fallback to mf_data
      const { data: oldCache } = await supabase
        .from('fund_cache')
        .select('data, last_updated')
        .eq('cache_key', 'mf_data')
        .single();
      
      if (oldCache) {
        return new Response(JSON.stringify({ 
          funds: oldCache.data,
          lastUpdated: oldCache.last_updated,
          source: 'legacy_cache'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ 
        funds: [],
        error: 'No workbook data found. Please run the process-workbook function first.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    let funds = workbookCache.data as any[];
    
    // Step 2: Enrich with latest AMFI NAV data
    try {
      const navMap = await fetchLatestNAVs();
      if (navMap.size > 0) {
        funds = enrichWithAMFI(funds, navMap);
      }
    } catch (err) {
      console.error("AMFI enrichment failed, using cached NAVs:", err);
    }
    
    // Step 3: Update the cache with enriched data
    const now = new Date();
    await supabase
      .from('fund_cache')
      .delete()
      .eq('cache_key', 'mf_data');
    
    await supabase
      .from('fund_cache')
      .insert({
        cache_key: 'mf_data',
        data: funds,
        last_updated: now.toISOString(),
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    
    console.log(`Full refresh complete. ${funds.length} funds.`);
    
    return new Response(JSON.stringify({ 
      funds,
      count: funds.length,
      source: 'workbook+amfi',
      lastUpdated: now.toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Fetch fund data error:", error);
    return new Response(
      JSON.stringify({ error: "Fund data request failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
