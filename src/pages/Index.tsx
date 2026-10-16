import { WorkspaceModules } from '@/components/dashboard/WorkspaceModules';
import { DataFreshnessNotice } from '@/components/dashboard/DataFreshnessNotice';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recommendFundsV2, RecommendationPreferences } from '@/utils/recommendation/intersectionEngine';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeaderZone } from '@/components/dashboard/DashboardHeaderZone';
import { DashboardBackground } from '@/components/dashboard/DashboardBackground';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { FundCard } from '@/components/dashboard/FundCard';
import { SectorAllocationChart } from '@/components/dashboard/SectorAllocationChart';
import { FundDetailModal } from '@/components/dashboard/FundDetailModal';
import { SectorSearchDropdown } from '@/components/dashboard/SectorSearchDropdown';
import { FundComparisonCard } from '@/components/dashboard/FundComparisonCard';
import { PortfolioFundModal } from '@/components/dashboard/PortfolioFundModal';
import { DashboardLoadingState } from '@/components/dashboard/DashboardLoadingState';
import { AllFundsTab } from '@/components/dashboard/AllFundsTab';
import { AIChat } from '@/components/dashboard/AIChat';
import { CAMSUpload } from '@/components/dashboard/CAMSUpload';
import { BuildPortfolio } from '@/components/dashboard/BuildPortfolio';
import { AddFundDialog } from '@/components/dashboard/AddFundDialog';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MutualFund, FundSectorData } from '@/types/mutualFund';
import { getCachedSectorData } from '@/utils/sectorDataGenerator';
import { 
  Plus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Bookmark,
  Wallet
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFundCache } from '@/hooks/useFundCache';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePortfolio, PortfolioItem } from '@/hooks/usePortfolio';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { funds, isLoading, refreshFunds, freshness, error: fundError } = useFundCache();
  const { watchlist, isInWatchlist, toggleWatchlist } = useWatchlist();
  const { 
    portfolio, 
    addToPortfolio, 
    removeFromPortfolio, 
    portfolioSummary,
    isLoading: portfolioLoading 
  } = usePortfolio();

  const [globalSearch, setGlobalSearch] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [aiResetKey, setAiResetKey] = useState(0);
  const [selectedFundA, setSelectedFundA] = useState('');
  const [selectedFundB, setSelectedFundB] = useState('');
  
  // Modal states
  const [selectedFundForModal, setSelectedFundForModal] = useState<MutualFund | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddToPortfolioOpen, setIsAddToPortfolioOpen] = useState(false);
  const [portfolioFundToAdd, setPortfolioFundToAdd] = useState<MutualFund | null>(null);
  const [investedAmount, setInvestedAmount] = useState('');
  const [sipAmount, setSipAmount] = useState('');
  const [isSip, setIsSip] = useState(false);
  
  // Portfolio fund detail modal
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
  const [selectedPortfolioFund, setSelectedPortfolioFund] = useState<MutualFund | null>(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);

  // CAMS uploaded flag
  const [hasCamsData, setHasCamsData] = useState(false);
  const [isAddFundOpen, setIsAddFundOpen] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Set initial comparison funds
  useEffect(() => {
    if (funds.length > 0 && !selectedFundA) {
      setSelectedFundA(funds[0].id);
    }
    if (funds.length > 1 && !selectedFundB) {
      setSelectedFundB(funds[1].id);
    }
  }, [funds, selectedFundA, selectedFundB]);

  // Get user's first name
  const firstName = useMemo(() => {
    if (profile?.full_name) {
      return profile.full_name.split(' ')[0];
    }
    return null;
  }, [profile]);

  // Filter funds using recommendation engine
  const personalizedFunds = useMemo(() => {
    if (!profile || funds.length === 0) return [];
    
    const prefs: RecommendationPreferences = {
      riskTolerance: profile.risk_tolerance || 'moderate',
      investmentGoal: profile.investment_goal || 'wealth',
      investmentHorizon: profile.investment_horizon || 'long',
      experienceLevel: profile.experience_level || 'beginner',
      investmentAmount: profile.investment_amount || 'medium',
    };

    const recommended = recommendFundsV2(funds, prefs);
    return recommended.length > 0 ? recommended.slice(0, 9) : funds.slice(0, 9);
  }, [funds, profile]);

  // Global search results
  const globalFilteredFunds = useMemo(() => {
    if (!globalSearch) return [];
    const query = globalSearch.toLowerCase();
    return funds.filter(f => 
      f.name.toLowerCase().includes(query) || 
      f.amc.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [funds, globalSearch]);

  // Watchlist funds
  const watchlistFunds = useMemo(() => 
    funds.filter(f => watchlist.some(w => w.fund_id === f.id)),
    [funds, watchlist]
  );

  // Sector data
  const getSectorData = (fundId: string): FundSectorData | null => {
    const fund = funds.find(f => f.id === fundId);
    if (!fund) return null;
    return getCachedSectorData(fund);
  };

  const sectorDataA = useMemo(() => getSectorData(selectedFundA), [selectedFundA, funds]);
  const sectorDataB = useMemo(() => getSectorData(selectedFundB), [selectedFundB, funds]);
  const comparisonFundA = useMemo(() => funds.find(f => f.id === selectedFundA), [selectedFundA, funds]);
  const comparisonFundB = useMemo(() => funds.find(f => f.id === selectedFundB), [selectedFundB, funds]);
  const modalSectorData = useMemo(() => {
    if (!selectedFundForModal) return null;
    return getCachedSectorData(selectedFundForModal);
  }, [selectedFundForModal]);

  const handleFundClick = (fund: MutualFund) => {
    setSelectedFundForModal(fund);
    setIsModalOpen(true);
  };

  const handleAddToPortfolio = (fund: MutualFund) => {
    setPortfolioFundToAdd(fund);
    setInvestedAmount('');
    setSipAmount('');
    setIsSip(false);
    setIsAddToPortfolioOpen(true);
  };

  const handlePortfolioItemClick = (item: PortfolioItem) => {
    const fund = funds.find(f => f.id === item.fund_id);
    if (fund) {
      setSelectedPortfolioItem(item);
      setSelectedPortfolioFund(fund);
      setIsPortfolioModalOpen(true);
    }
  };

  const submitAddToPortfolio = async () => {
    if (!portfolioFundToAdd) return;
    
    await addToPortfolio(portfolioFundToAdd, {
      invested_amount: investedAmount ? parseFloat(investedAmount) : undefined,
      sip_amount: sipAmount ? parseFloat(sipAmount) : undefined,
      is_sip: isSip,
    });
    
    setIsAddToPortfolioOpen(false);
    setPortfolioFundToAdd(null);
  };

  // Generate educational insights for portfolio
  const getPortfolioInsight = (item: PortfolioItem): { type: 'continue' | 'review' | 'reduce'; message: string } => {
    const fund = funds.find(f => f.id === item.fund_id);
    if (!fund) return { type: 'review', message: 'Fund data not available for analysis' };

    const cat = fund.category || '';
    const isEquity = cat.startsWith('EQ-') || cat === 'Equity';
    const isDebt = cat.startsWith('DT-') || cat === 'Debt';

    if (fund.sharpeRatio >= 1.5 && fund.cagr1Y > 15 && fund.expenseRatio < 1.5) {
      return { type: 'continue', message: `Strong risk-adjusted performance with Sharpe ${fund.sharpeRatio.toFixed(2)} and ${fund.cagr1Y.toFixed(1)}% 1Y return. Low expense ratio keeps costs efficient. Consider continuing SIP or holding.` };
    }
    if (fund.cagr1Y > 25 && fund.volatility > 20) {
      return { type: 'review', message: `High returns (${fund.cagr1Y.toFixed(1)}%) but elevated volatility (${fund.volatility.toFixed(1)}%). The fund may be in a momentum phase. Review if it aligns with your risk capacity and rebalance if overweight.` };
    }
    if (fund.sharpeRatio < 0.5 && fund.cagr1Y < 5 && isEquity) {
      return { type: 'reduce', message: `Underperforming with ${fund.cagr1Y.toFixed(1)}% return and weak Sharpe ratio (${fund.sharpeRatio.toFixed(2)}) for an equity fund. Consider switching to a better-rated fund in the same category.` };
    }
    if (fund.expenseRatio > 2.0) {
      return { type: 'review', message: `High expense ratio of ${fund.expenseRatio.toFixed(2)}% is eroding returns. Over 10 years, this could cost ₹${Math.round(((item.invested_amount || 50000) * 0.02) * 10 / 1000)}K+ in fees. Consider a direct plan or lower-cost alternative.` };
    }
    if (isDebt && fund.cagr1Y > 7) {
      return { type: 'continue', message: `Solid ${fund.cagr1Y.toFixed(1)}% return for a debt fund with low volatility (${fund.volatility.toFixed(1)}%). Good for capital preservation and regular income goals.` };
    }
    if (fund.beta !== undefined && fund.beta > 1.3 && isEquity) {
      return { type: 'review', message: `High beta (${fund.beta.toFixed(2)}) means this fund amplifies market swings. In a 10% correction, expect ~${(10 * fund.beta).toFixed(0)}% fall. Suitable only if your horizon is 5+ years.` };
    }
    if (fund.cagr3Y > 12 && fund.cagr5Y > 10) {
      return { type: 'continue', message: `Consistent multi-year performer: ${fund.cagr3Y.toFixed(1)}% (3Y) and ${fund.cagr5Y.toFixed(1)}% (5Y) CAGR. Long-term compounding is working in your favor.` };
    }
    if (fund.cagr1Y < 0) {
      return { type: 'review', message: `Currently in negative territory (${fund.cagr1Y.toFixed(1)}%). Evaluate if the downturn is market-wide or fund-specific. If the fund's 3Y track record is strong, consider averaging down via SIP.` };
    }
    return { type: 'continue', message: `Performance within expectations for a ${fund.category} fund. Sharpe: ${fund.sharpeRatio.toFixed(2)}, Expense: ${fund.expenseRatio.toFixed(2)}%. Continue monitoring quarterly.` };
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleOpenAuctus = () => {
    setActiveTab('ai');
    setAiResetKey(k => k + 1);
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <DashboardBackground />
      {/* Header: always shown on lg+; on mobile only on Home (overview) tab */}
      <div className={activeTab === 'overview' ? '' : 'hidden lg:block'}>
        <DashboardHeader
          onRefresh={refreshFunds}
          isLoading={isLoading}
          onOpenAuctus={handleOpenAuctus}
        />
      </div>
      
      <div className="flex flex-1">
        {/* Desktop Sidebar - Fixed position */}
        <DashboardSidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          watchlistCount={watchlist.length}
          portfolioCount={portfolio.length}
        />
        
        {/* Main content with left margin to account for fixed sidebar */}
        <main className="flex-1 px-4 md:px-6 lg:px-10 py-8 pb-24 lg:pb-8 overflow-x-hidden bg-gradient-to-b from-transparent via-background/50 to-background lg:ml-24">
          <div className="max-w-6xl mx-auto">

            {/* Dashboard Header Zone */}
            <DashboardHeaderZone
              firstName={activeTab === 'overview' ? firstName : null}
              globalSearch={globalSearch}
              onGlobalSearchChange={setGlobalSearch}
              globalFilteredFunds={globalFilteredFunds}
              onFundClick={(fund) => {
                handleFundClick(fund);
              }}
              showSearch={activeTab === 'overview' || activeTab === 'watchlist'}
              showInfoText={activeTab === 'overview'}
              showGreeting={activeTab === 'overview'}
            />

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="animate-fade-in space-y-6">
                  {!isLoading && <DataFreshnessNotice freshness={freshness} error={fundError} />}
                  {isLoading ? (
                    <DashboardLoadingState />
                  ) : personalizedFunds.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {personalizedFunds.map(fund => (
                        <FundCard 
                          key={fund.id}
                          fund={fund} 
                          onClick={() => handleFundClick(fund)}
                          isBookmarked={isInWatchlist(fund.id)}
                          onBookmarkToggle={() => toggleWatchlist(fund)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Card className="glass-card">
                      <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground mb-4">
                          No personalized funds available. Complete your profile to get tailored suggestions.
                        </p>
                        <Button onClick={() => navigate('/onboarding')}>
                          Complete Profile
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  <WorkspaceModules onOpenTab={setActiveTab} />
                </div>
              )}

              {/* All Funds Tab */}
              {activeTab === 'allfunds' && (
                <AllFundsTab
                  funds={funds}
                  isLoading={isLoading}
                  onFundClick={handleFundClick}
                  isInWatchlist={isInWatchlist}
                  onBookmarkToggle={toggleWatchlist}
                />
              )}

              {/* Sectors Tab */}
              {activeTab === 'sectors' && (
                <div className="animate-fade-in space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SectorSearchDropdown
                      funds={funds}
                      selectedFundId={selectedFundA}
                      onSelect={setSelectedFundA}
                      placeholder="Search Fund A by name or AMC..."
                      watchlistFundIds={watchlist.map(w => w.fund_id)}
                      onBookmarkToggle={toggleWatchlist}
                    />
                    <SectorSearchDropdown
                      funds={funds}
                      selectedFundId={selectedFundB}
                      onSelect={setSelectedFundB}
                      placeholder="Search Fund B by name or AMC..."
                      watchlistFundIds={watchlist.map(w => w.fund_id)}
                      onBookmarkToggle={toggleWatchlist}
                    />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {sectorDataA && <SectorAllocationChart sectorData={sectorDataA} />}
                    {sectorDataB && <SectorAllocationChart sectorData={sectorDataB} />}
                  </div>
                  <FundComparisonCard fundA={comparisonFundA} fundB={comparisonFundB} />

                  <Card className="bg-secondary/30">
                    <CardContent className="py-4">
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">Note:</strong> Sector allocation data is indicative. For exact holdings, refer to the fund's official factsheet.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Watchlist Tab */}
              {activeTab === 'watchlist' && (
                <div className="animate-fade-in space-y-6">
                  {watchlistFunds.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {watchlistFunds.map(fund => (
                        <FundCard 
                          key={fund.id}
                          fund={fund} 
                          onClick={() => handleFundClick(fund)}
                          isBookmarked={true}
                          onBookmarkToggle={() => toggleWatchlist(fund)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Card className="glass-card">
                      <CardContent className="py-12 text-center">
                        <Bookmark className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p className="text-muted-foreground mb-2">Your watchlist is empty</p>
                        <p className="text-sm text-muted-foreground">
                          Click the bookmark icon on any fund to add it to your watchlist
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Portfolio Tab */}
              {activeTab === 'portfolio' && (
                <div className="animate-fade-in space-y-6">
                  {/* Portfolio Summary Cards */}
                  {portfolio.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="glass-card">
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground mb-1">Total Invested</p>
                          <p className="text-2xl font-bold text-foreground">
                            ₹{portfolioSummary.totalInvested.toLocaleString()}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="glass-card">
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground mb-1">Monthly SIP</p>
                          <p className="text-2xl font-bold text-foreground">
                            ₹{portfolioSummary.totalSIP.toLocaleString()}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="glass-card">
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground mb-1">Funds in Portfolio</p>
                          <p className="text-2xl font-bold text-foreground">
                            {portfolioSummary.fundCount}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Unified action card: Upload CAMS / Add manually */}
                  {portfolio.length === 0 && !hasCamsData && (
                    <Card className="glass-card">
                      <CardContent className="py-8 text-center">
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Upload CAMS statement / Create manually
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                          Import your full portfolio from a CAMS PDF, or add individual funds one at a time.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <CAMSUpload compact onDataLoaded={() => setHasCamsData(true)} />
                          <Button onClick={() => setIsAddFundOpen(true)}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Mutual Fund
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* CAMS results (only after upload) */}
                  {hasCamsData && (
                    <CAMSUpload compact={false} onDataLoaded={() => setHasCamsData(true)} />
                  )}

                  {/* Investments list (only when there are holdings) */}
                  {portfolio.length > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Your Investments</h3>
                        <div className="flex gap-2">
                          <CAMSUpload compact onDataLoaded={() => setHasCamsData(true)} />
                          <Button size="sm" onClick={() => setIsAddFundOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Fund
                          </Button>
                        </div>
                      </div>

                      {portfolioLoading ? (
                        <DashboardLoadingState />
                      ) : (
                        <div className="space-y-4">
                          {portfolio.map(item => {
                            const insight = getPortfolioInsight(item);
                            return (
                              <Card
                                key={item.id}
                                className="glass-card cursor-pointer hover:border-white/25 transition-colors"
                                onClick={() => handlePortfolioItemClick(item)}
                              >
                                <CardContent className="py-4">
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-semibold">{item.fund_name}</h4>
                                        <Badge variant="outline" className="text-xs">
                                          {item.fund_category}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                        {item.invested_amount && (
                                          <span>Invested: ₹{item.invested_amount.toLocaleString()}</span>
                                        )}
                                        {item.is_sip && item.sip_amount && (
                                          <span>SIP: ₹{item.sip_amount.toLocaleString()}/mo</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                                        insight.type === 'continue'
                                          ? 'bg-success/20 text-success'
                                          : insight.type === 'reduce'
                                            ? 'bg-destructive/20 text-destructive'
                                            : 'bg-warning/20 text-warning'
                                      }`}>
                                        {insight.type === 'continue' && <TrendingUp className="h-3 w-3" />}
                                        {insight.type === 'review' && <Minus className="h-3 w-3" />}
                                        {insight.type === 'reduce' && <TrendingDown className="h-3 w-3" />}
                                        {insight.message}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFromPortfolio(item.id);
                                        }}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  <Card className="bg-warning/10 border-warning/30">
                    <CardContent className="py-4 flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-warning">Disclaimer:</strong> Educational insights only. Not investment advice. 
                        Past performance does not guarantee future results. Mutual fund investments are subject to market risks. 
                        Please consult a qualified financial advisor before making investment decisions.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Build Portfolio Tab */}
              {activeTab === 'build' && (
                <BuildPortfolio funds={funds} userProfile={profile} />
              )}

              {/* AI Tab */}
              {activeTab === 'ai' && (
                <AIChat resetKey={aiResetKey} />
              )}
            </div>
          </div>
        </main>
      </div>
      
      {activeTab !== 'ai' && <Footer />}

      {/* Mobile bottom navigation (phones / small tablets only) */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        watchlistCount={watchlist.length}
        portfolioCount={portfolio.length}
      />

      {/* Fund Detail Modal */}
      <FundDetailModal
        fund={selectedFundForModal}
        sectorData={modalSectorData}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToPortfolio={handleAddToPortfolio}
        userRiskProfile={profile?.risk_tolerance || undefined}
        isBookmarked={selectedFundForModal ? isInWatchlist(selectedFundForModal.id) : false}
        onBookmarkToggle={toggleWatchlist}
      />

      {/* Add to Portfolio Dialog */}
      <Dialog open={isAddToPortfolioOpen} onOpenChange={setIsAddToPortfolioOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Portfolio</DialogTitle>
            <DialogDescription>
              {portfolioFundToAdd?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invested-amount">Invested Amount (₹)</Label>
              <Input
                id="invested-amount"
                type="number"
                placeholder="e.g., 50000"
                value={investedAmount}
                onChange={(e) => setInvestedAmount(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-sip"
                checked={isSip}
                onChange={(e) => setIsSip(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="is-sip">This is a SIP investment</Label>
            </div>
            {isSip && (
              <div className="space-y-2">
                <Label htmlFor="sip-amount">Monthly SIP Amount (₹)</Label>
                <Input
                  id="sip-amount"
                  type="number"
                  placeholder="e.g., 5000"
                  value={sipAmount}
                  onChange={(e) => setSipAmount(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddToPortfolioOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAddToPortfolio}>
              <Plus className="h-4 w-4 mr-2" />
              Add to Portfolio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Portfolio Fund Detail Modal */}
      <PortfolioFundModal
        fund={selectedPortfolioFund}
        portfolioItem={selectedPortfolioItem}
        isOpen={isPortfolioModalOpen}
        onClose={() => setIsPortfolioModalOpen(false)}
        insight={selectedPortfolioItem ? getPortfolioInsight(selectedPortfolioItem) : null}
      />

      {/* Add Mutual Fund manual flow */}
      <AddFundDialog
        open={isAddFundOpen}
        onClose={() => setIsAddFundOpen(false)}
        funds={funds}
        onAdd={async (fund, details) => {
          await addToPortfolio(fund, details);
        }}
      />
    </div>
  );
};

export default Index;
