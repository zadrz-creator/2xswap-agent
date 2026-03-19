'use client';
import { useLiveData } from '@/lib/live-data';

export default function ActivePositions() {
  const { positions } = useLiveData();
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
          Active Positions
        </h2>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-mono border"
          style={{ borderColor: '#00d4ff40', color: '#00d4ff', background: 'rgba(0,212,255,0.08)' }}
        >
          {positions.length} open
        </span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }}
      >
        {positions.length === 0 ? (
          <div className="py-12 text-center" style={{ color: '#64748b' }}>
            No active positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a4a', background: '#0d0d1f' }}>
                  {['ID', 'Asset', 'Amount', 'Open Price', 'Current Price', 'P&L %', 'Age (h)', 'Strategy'].map(h => (
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
                {positions.map((p, i) => {
                  const pnlColor = p.pnlPct >= 0 ? '#00ff88' : '#ff4444';
                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: i < positions.length - 1 ? '1px solid #1e1e38' : undefined }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748b' }}>{p.id}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold" style={{ color: '#00d4ff' }}>{p.asset}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#e2e8f0' }}>{p.amount}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>
                        ${p.openPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs transition-all duration-500" style={{ color: '#e2e8f0' }}>
                        ${p.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-sm font-bold px-2 py-0.5 rounded transition-all duration-500"
                          style={{
                            color: pnlColor,
                            background: p.pnlPct >= 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                          }}
                        >
                          {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>{p.ageHours.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded border"
                          style={{ color: '#94a3b8', borderColor: '#2a2a4a' }}
                        >
                          {p.strategy}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
