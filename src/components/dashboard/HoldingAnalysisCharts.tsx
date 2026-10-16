import { IllustrativeBadge } from './IllustrativeBadge';
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MutualFund } from '@/types/mutualFund';
import { getAssetSplit, getSectorSplit } from '@/utils/holdingsGenerator';

interface HoldingAnalysisChartsProps {
  fund: MutualFund;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.[0]) {
    const d = payload[0].payload;
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="font-medium text-foreground text-xs">{d.type || d.sector}</p>
        <p className="text-sm text-primary font-semibold">{d.percentage.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-medium">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function HoldingAnalysisCharts({ fund }: HoldingAnalysisChartsProps) {
  const assetData = useMemo(() => getAssetSplit(fund), [fund]);
  const sectorData = useMemo(() => getSectorSplit(fund), [fund]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Asset Split */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">Asset Allocation<IllustrativeBadge /></CardTitle>
          <p className="text-xs text-muted-foreground">Equity vs Debt vs Cash split</p>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={assetData} cx="50%" cy="50%" labelLine={false} label={renderLabel}
                  innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="percentage">
                  {assetData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {assetData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground flex-1">{item.type}</span>
                <span className="font-medium text-foreground">{item.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sector Split */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">Sector Allocation<IllustrativeBadge /></CardTitle>
          <p className="text-xs text-muted-foreground">Sector-wise portfolio breakdown</p>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" labelLine={false} label={renderLabel}
                  innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="percentage">
                  {sectorData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {sectorData.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground flex-1 truncate">{item.sector}</span>
                <span className="font-medium text-foreground">{item.percentage.toFixed(1)}%</span>
              </div>
            ))}
            {sectorData.length > 5 && (
              <p className="text-[10px] text-muted-foreground/60 text-center">+{sectorData.length - 5} more sectors</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
