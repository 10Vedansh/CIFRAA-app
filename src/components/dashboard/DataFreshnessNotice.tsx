import { AlertTriangle } from 'lucide-react';
import type { DataFreshness, FundDataError } from '@/lib/funds/contracts';

interface Props {
  freshness: DataFreshness;
  error: FundDataError | null;
}

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Only renders when data is stale, expired, from this device, or failed to load. */
export function DataFreshnessNotice({ freshness, error }: Props) {
  const { status, lastUpdated, source } = freshness;
  const offline = source === 'local-cache' && !!error;
  if (status === 'fresh' && !offline) return null;
  if (status === 'unknown' && !error) return null;

  let text: string;
  if (status === 'unknown') text = 'Fund data could not be loaded right now.';
  else if (offline) text = `Showing fund data saved on this device (last updated ${fmt(lastUpdated!)}). It may be out of date.`;
  else if (status === 'expired') text = `Fund data has expired (last updated ${fmt(lastUpdated!)}). Figures may not reflect current markets.`;
  else text = `Fund data was last updated on ${fmt(lastUpdated!)}. Figures may not reflect current markets.`;

  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
