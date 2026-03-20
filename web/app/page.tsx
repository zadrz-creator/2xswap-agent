import Header from '@/components/Header';
import MarketSignals from '@/components/MarketSignals';
import ActivePositions from '@/components/ActivePositions';
import LiquidationsAvoided from '@/components/LiquidationsAvoided';
import EquityChart from '@/components/EquityChart';
import DecisionsLog from '@/components/DecisionsLog';
import BacktestResults from '@/components/BacktestResults';

export default function Dashboard() {
  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <MarketSignals />
        <ActivePositions />
        <LiquidationsAvoided />

        {/* Two-col layout for chart + decisions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <EquityChart />
          </div>
          <div className="lg:col-span-1">
            <DecisionsLog />
          </div>
        </div>

        <BacktestResults />
      </main>

      {/* Footer */}
      <footer
        className="border-t mt-12 px-4 py-6 text-center space-y-1"
        style={{ borderColor: '#1e1e38' }}
      >
        <p className="text-sm font-semibold" style={{ color: '#64748b' }}>
          No liquidation. No interest. No funding rates. Agent-safe leverage. ⚡
        </p>
        <p className="text-xs" style={{ color: '#3a3a5a' }}>
          2xSwap — Synthesis Hackathon 2026
        </p>
      </footer>
    </div>
  );
}
