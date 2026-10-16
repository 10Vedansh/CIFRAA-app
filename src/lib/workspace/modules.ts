// Workspace module registry (CIFRAA 2.0). Each module points at an existing
// dashboard tab when one already provides the capability; otherwise it is 'planned'.
export type WorkspaceStatus = 'available' | 'partial' | 'planned';

export interface WorkspaceModule {
  id: string;
  label: string;
  description: string;
  status: WorkspaceStatus;
  /** Existing dashboard tab id this module opens today. */
  tab: string | null;
}

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  { id: 'market', label: 'Market Overview', description: 'Your personalised overview of the fund market', status: 'partial', tab: 'overview' },
  { id: 'supercharts', label: 'Fund Supercharts', description: 'Real NAV-history charts. Needs a historical NAV dataset', status: 'planned', tab: null },
  { id: 'screener', label: 'Mutual Fund Screener', description: 'Browse and filter all funds', status: 'partial', tab: 'allfunds' },
  { id: 'compare', label: 'Fund Comparison Lab', description: 'Side-by-side fund comparison', status: 'partial', tab: 'sectors' },
  { id: 'portfolio', label: 'Portfolio Intelligence', description: 'Holdings, CAMS import and insights', status: 'available', tab: 'portfolio' },
  { id: 'watchlists', label: 'Watchlists & Alerts', description: 'Saved funds (alerts are planned)', status: 'partial', tab: 'watchlist' },
  { id: 'research', label: 'AI Research', description: 'Ask Auctus about funds and markets', status: 'available', tab: 'ai' },
];
