import { IllustrativeBadge } from './IllustrativeBadge';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MutualFund } from '@/types/mutualFund';
import { getHoldingsForFund, StockHolding } from '@/utils/holdingsGenerator';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';

interface HoldingsTableProps {
  fund: MutualFund;
}

export function HoldingsTable({ fund }: HoldingsTableProps) {
  const [showAll, setShowAll] = useState(false);
  const holdings = getHoldingsForFund(fund);
  const displayed = showAll ? holdings : holdings.slice(0, 6);
  const totalPercentage = holdings.reduce((sum, h) => sum + h.percentage, 0);

  return (
    <Card className="glass-card border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Top Holdings
          <IllustrativeBadge note="Sample holdings typical of this category, not this fund's actual portfolio disclosure. Check the AMC factsheet for real holdings." />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {holdings.length} sample holdings • Not the fund's actual disclosure
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-hidden rounded-lg border border-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/30">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">#</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Holding</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Sector</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Weight</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((holding, idx) => (
                <tr 
                  key={idx}
                  className="border-t border-border/20 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-foreground text-xs">
                    {holding.name}
                    <span className="sm:hidden block text-[10px] text-muted-foreground mt-0.5">{holding.sector}</span>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs hidden sm:table-cell">{holding.sector}</td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-secondary/50 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          className="h-full bg-primary/60 rounded-full" 
                          style={{ width: `${Math.min(100, (holding.percentage / (holdings[0]?.percentage || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="font-medium text-foreground text-xs min-w-[40px] text-right">
                        {holding.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {holdings.length > 6 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>Show Less <ChevronUp className="h-3 w-3 ml-1" /></>
            ) : (
              <>View All {holdings.length} Holdings <ChevronDown className="h-3 w-3 ml-1" /></>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
