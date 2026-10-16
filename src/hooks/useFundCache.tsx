import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MutualFund } from '@/types/mutualFund';
import { toast } from 'sonner';
import { computeFreshness, type DataFreshness, type FundDataError } from '@/lib/funds/contracts';

const LOCAL_CACHE_KEY = 'fundex_mf_cache';
const REQUEST_TIMEOUT_MS = 15000;

interface LocalCache {
  funds: MutualFund[];
  lastUpdated: string;
  expiresAt?: string | null;
}

interface FetchResult {
  funds: MutualFund[];
  lastUpdated: string;
  expiresAt: string | null;
}

const toDate = (s?: string | null) => (s ? new Date(s) : null);

function loadFromLocalCache(): LocalCache | null {
  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as LocalCache;
    return Array.isArray(parsed?.funds) ? parsed : null;
  } catch {
    return null;
  }
}

function saveToLocalCache(data: MutualFund[], lastUpdated: string, expiresAt: string | null) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ funds: data, lastUpdated, expiresAt }));
  } catch (err) {
    // Quota exceeded or storage disabled: data still works in memory for this session.
    console.warn('Local fund cache not saved:', err);
  }
}

/** Runs an invoke with a real timeout (supabase.functions.invoke ignores AbortController). */
async function withTimeout<T>(p: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timed out')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Read-only: server cache. Shared-data refreshes are admin/scheduled-job only.
async function fetchServerCache(): Promise<FetchResult> {
  const response = await withTimeout(supabase.functions.invoke('fetch-fund-data?action=cached'));
  if (response.error) throw response.error;
  const funds = response.data?.funds;
  if (!Array.isArray(funds) || funds.length === 0) throw new Error('No cached fund data available');
  return {
    funds: funds as MutualFund[],
    lastUpdated: response.data.lastUpdated,
    expiresAt: response.data.expiresAt ?? null,
  };
}

// Legacy last-resort source (signed-in users only).
async function fetchFromLegacyAPI(): Promise<FetchResult> {
  const { data, error } = await withTimeout(supabase.functions.invoke('mfapi'));
  if (error) throw error;
  if (!Array.isArray(data?.funds) || data.funds.length === 0) throw new Error('No funds returned');
  return { funds: data.funds, lastUpdated: new Date().toISOString(), expiresAt: null };
}

function classifyError(err: unknown): FundDataError {
  const message = err instanceof Error ? err.message : String(err);
  if (/401|403|unauthor|forbidden/i.test(message)) return { kind: 'unauthorized', message };
  if (/timed out|network|fetch/i.test(message)) return { kind: 'network', message };
  if (/no .*fund|no cached/i.test(message)) return { kind: 'empty', message };
  return { kind: 'unknown', message };
}

export function useFundCache() {
  const [funds, setFunds] = useState<MutualFund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveData, setIsLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [freshness, setFreshness] = useState<DataFreshness>(
    computeFreshness(null, null, 'none'),
  );
  const [error, setError] = useState<FundDataError | null>(null);

  const apply = (r: FetchResult, source: DataFreshness['source']) => {
    const lu = toDate(r.lastUpdated);
    setFunds(r.funds);
    setLastUpdated(lu);
    setIsLiveData(source !== 'local-cache');
    setFreshness(computeFreshness(lu, toDate(r.expiresAt), source));
  };

  const fetchFunds = useCallback(async (manual = false) => {
    setIsLoading(true);
    const local = loadFromLocalCache();
    if (local && local.funds.length > 0) {
      apply({ funds: local.funds, lastUpdated: local.lastUpdated, expiresAt: local.expiresAt ?? null }, 'local-cache');
    }

    try {
      const server = await fetchServerCache();
      apply(server, 'server-cache');
      saveToLocalCache(server.funds, server.lastUpdated, server.expiresAt);
      setError(null);
      if (manual) toast.success(`Loaded ${server.funds.length} funds`);
      return;
    } catch (err) {
      const e = classifyError(err);
      console.error('Server fund cache unavailable:', e.message);
      if (local && local.funds.length > 0) {
        setError(e);
        toast.info('Showing saved fund data from this device; it may be out of date.');
        return;
      }
      try {
        const legacy = await fetchFromLegacyAPI();
        apply(legacy, 'legacy-api');
        setError(null);
        return;
      } catch (legacyErr) {
        setError(classifyError(legacyErr));
        setFunds([]);
        setIsLiveData(false);
        setFreshness(computeFreshness(null, null, 'none'));
        toast.error('Unable to load fund data. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  return {
    funds,
    isLoading,
    isLiveData,
    lastUpdated,
    freshness,
    error,
    refreshFunds: () => fetchFunds(true),
  };
}
