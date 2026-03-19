'use client';
import { backtestResults } from '@/lib/mock-data';

export default function BacktestResults() {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
        Backtest Results Summary
      </h2>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: '#1a1a2e', borderColor: '#2a2a4a', boxShadow: '0 0 30px rgba(0,212,255,0.05)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a4a', background: '#0d0d1f' }}>
                {['Strategy', 'Trades', 'Win Rate', 'PnL %', 'Max DD', 'Sharpe', 'Liq. Avoided'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: '#64748b' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backtestResults.map((r, i) => {
                const isCombined = r.strategy === 'Combined';
                return (
                  <tr
                    key={r.strategy}
                    className="hover:bg-white/[0.02] transition-colors"
                    style={{
                      borderBottom: i < backtestResults.length - 1 ? '1px solid #1e1e38' : undefined,
                      background: isCombined ? 'rgba(0,212,255,0.04)' : undefined,
                    }}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="font-semibold"
                        style={{ color: isCombined ? '#00d4ff' : '#e2e8f0' }}
                      >
                        {isCombined && <span className="mr-1">⚡</span>}
                        {r.strategy}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>{r.trades}</td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs font-bold"
                        style={{ color: r.winRate >= 75 ? '#00ff88' : r.winRate >= 60 ? '#ffd700' : '#94a3b8' }}
                      >
                        {r.winRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-sm font-bold px-2 py-0.5 rounded"
                        style={{
                          color: '#00ff88',
                          background: 'rgba(0,255,136,0.1)',
                        }}
                      >
                        +{r.pnlPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs" style={{ color: '#ff4444' }}>
                        {r.maxDD.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-sm font-bold"
                        style={{ color: r.sharpe >= 2 ? '#00d4ff' : r.sharpe >= 1 ? '#ffd700' : '#94a3b8' }}
                      >
                        {r.sharpe.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded border"
                        style={{ color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.08)' }}
                      >
                        {r.liquidationsAvoided} avoided
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Note */}
        <div
          className="px-4 py-3 text-xs border-t"
          style={{ borderColor: '#2a2a4a', color: '#64748b' }}
        >
          Backtest period: 72h · Starting capital: $10,000 · No leverage interest or liquidation risk
        </div>
      </div>
    </section>
  );
}
