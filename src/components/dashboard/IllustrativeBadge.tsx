import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  note?: string;
}

/** Marks generated visualisations so users never mistake them for actual fund data. */
export function IllustrativeBadge({ note = 'Illustrative model, not actual fund data. Refer to the official factsheet.' }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="note"
          aria-label={note}
          className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
        >
          <Info className="h-3 w-3" aria-hidden />
          Illustrative
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">{note}</TooltipContent>
    </Tooltip>
  );
}
