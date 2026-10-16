import { WORKSPACE_MODULES } from '@/lib/workspace/modules';
import { cn } from '@/lib/utils';

interface Props {
  onOpenTab: (tab: string) => void;
}

const STATUS_LABEL = { available: null, partial: 'Preview', planned: 'Planned' } as const;

/** Workspace navigation shell. Links only to modules that already work. */
export function WorkspaceModules({ onOpenTab }: Props) {
  return (
    <section aria-labelledby="workspace-heading" className="space-y-3">
      <h2 id="workspace-heading" className="text-sm font-medium text-muted-foreground">Workspace</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {WORKSPACE_MODULES.map((m) => {
          const disabled = !m.tab;
          const badge = STATUS_LABEL[m.status];
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              title={m.description}
              onClick={() => m.tab && onOpenTab(m.tab)}
              className={cn(
                'rounded-xl border border-border/40 bg-card/40 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-card/70',
              )}
            >
              <span className="block text-xs font-semibold text-foreground">{m.label}</span>
              {badge && (
                <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-muted-foreground">{badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
