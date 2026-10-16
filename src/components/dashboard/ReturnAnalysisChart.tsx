import { IllustrativeBadge } from './IllustrativeBadge';
import { useState, useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { MutualFund } from '@/types/mutualFund';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ReturnAnalysisChartProps {
  fund: MutualFund;
  compact?: boolean;
}

type TimeFrame = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

const TIME_FRAMES: { key: TimeFrame; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: '3Y', label: '3Y' },
  { key: '5Y', label: '5Y' },
  { key: 'ALL', label: 'All' },
];

function getReturnForTimeframe(fund: MutualFund, tf: TimeFrame): number | null {
  switch (tf) {
    case '1M': return fund.ret1M ?? null;
    case '3M': return fund.ret3M ?? null;
    case '6M': return fund.ret6M ?? null;
    case '1Y': return fund.ret1Y ?? fund.cagr1Y;
    case '3Y': return fund.ret3Y ?? fund.cagr3Y;
    case '5Y': return fund.ret5Y ?? fund.cagr5Y;
    case 'ALL': return fund.ret10Y ?? fund.cagr5Y;
  }
}

function generateNavCurve(fund: MutualFund, timeframe: TimeFrame): { date: string; nav: number }[] {
  const currentNav = fund.nav || 100;
  const returnPct = getReturnForTimeframe(fund, timeframe) ?? 0;
  
  const pointCountMap: Record<TimeFrame, number> = {
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 252,
    '3Y': 756,
    '5Y': 1260,
    'ALL': 2520,
  };
  
  const totalPoints = pointCountMap[timeframe];
  const sampledPoints = Math.min(totalPoints, 60); // Show max 60 data points for smoothness
  const step = Math.max(1, Math.floor(totalPoints / sampledPoints));
  
  // Calculate starting NAV based on return
  const years = { '1M': 1/12, '3M': 0.25, '6M': 0.5, '1Y': 1, '3Y': 3, '5Y': 5, 'ALL': 10 }[timeframe];
  const startNav = currentNav / Math.pow(1 + returnPct / 100, years);
  
  // Generate a realistic-looking NAV curve with some volatility
  const vol = (fund.volatility || 15) / 100;
  const dailyDrift = Math.log(currentNav / startNav) / totalPoints;
  const dailyVol = vol / Math.sqrt(252);
  
  const data: { date: string; nav: number }[] = [];
  let nav = startNav;
  
  // Use deterministic "random" based on fund id
  let seed = 0;
  for (let i = 0; i < fund.id.length; i++) seed += fund.id.charCodeAt(i);
  const nextRand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) - 0.5; };
  
  const now = new Date();
  
  for (let i = 0; i <= totalPoints; i += step) {
    const daysAgo = totalPoints - i;
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    if (i === 0) {
      nav = startNav;
    } else if (i >= totalPoints) {
      nav = currentNav;
    } else {
      nav = nav * Math.exp(dailyDrift * step + dailyVol * Math.sqrt(step) * nextRand());
    }
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = timeframe === '1M' 
      ? `${date.getDate()} ${monthNames[date.getMonth()]}`
      : (timeframe === '3M' || timeframe === '6M' || timeframe === '1Y')
        ? `${monthNames[date.getMonth()]} ${date.getDate()}`
        : `${monthNames[date.getMonth()]} '${String(date.getFullYear()).slice(2)}`;
    
    data.push({ date: label, nav: Math.round(nav * 100) / 100 });
  }
  
  // Ensure last point is current NAV
  if (data.length > 0) {
    data[data.length - 1].nav = currentNav;
  }
  
  return data;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.[0]) {
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-foreground mb-1 text-xs">{label}</p>
        <p className="text-sm font-semibold text-primary">₹{payload[0].value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

export function ReturnAnalysisChart({ fund, compact = false }: ReturnAnalysisChartProps) {
  const [selectedTF, setSelectedTF] = useState<TimeFrame>('1Y');
  
  const chartData = useMemo(() => generateNavCurve(fund, selectedTF), [fund, selectedTF]);
  const currentReturn = getReturnForTimeframe(fund, selectedTF);
  const isPositive = (currentReturn ?? 0) >= 0;

  const minNav = Math.min(...chartData.map(d => d.nav));
  const maxNav = Math.max(...chartData.map(d => d.nav));
  const padding = (maxNav - minNav) * 0.1 || 1;

  return (
    <Card className="glass-card border-border/30">
      <CardHeader className={cn(compact ? 'pb-2 pt-4 px-4' : 'pb-2')}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              NAV Performance
              <IllustrativeBadge note="Illustrative path between the start NAV and current NAV implied by the reported return. Daily NAV history is not yet available; this is not actual fund data." />
            </CardTitle>
            {!compact && (
              <CardDescription className="text-xs">Modelled curve from reported period return, not historical NAV</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentReturn !== null && (
              <span className={cn(
                "text-lg font-bold",
                isPositive ? 'text-success' : 'text-destructive'
              )}>
                {isPositive ? '+' : ''}{currentReturn.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        
        {/* Timeframe selector */}
        <div className="flex gap-1 mt-2">
          {TIME_FRAMES.map(tf => (
            <button
              key={tf.key}
              onClick={() => setSelectedTF(tf.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                selectedTF === tf.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={compact ? 'px-4 pb-4' : ''}>
        <div className={compact ? 'h-32' : 'h-52'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`navGrad-${fund.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₹${v.toFixed(0)}`}
                domain={[minNav - padding, maxNav + padding]}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="nav"
                stroke={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                strokeWidth={2}
                fill={`url(#navGrad-${fund.id})`}
                dot={false}
                activeDot={{ r: 4, fill: isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
