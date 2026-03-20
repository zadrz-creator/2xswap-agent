'use client';

const rows = [
  {
    feature: 'Liquidation',
    traditional: { text: 'Forced at ~-8% on 2x', bad: true },
    twoXSwap: { text: 'None — agent decides exit', good: true },
  },
  {
    feature: 'Funding Rate',
    traditional: { text: 'Unpredictable, bleeds capital', bad: true },
    twoXSwap: { text: 'Zero cost to hold', good: true },
  },
  {
    feature: 'Max Hold Period',
    traditional: { text: 'Hold until liquidated or closed', bad: true },
    twoXSwap: { text: 'Up to 1 year — agents can think in weeks', good: true },
  },
  {
    feature: 'Agent Safety',
    traditional: { text: 'Full wallet access required', bad: true },
    twoXSwap: { text: 'ScopedVault: bounded permissions', good: true },
  },
  {
    feature: 'Wick Survival',
    traditional: { text: 'Any -8%+ wick = position dead', bad: true },
    twoXSwap: { text: 'Survives any intraday wick', good: true },
  },
  {
    feature: 'Fee Structure',
    traditional: { text: 'Funding rate + liquidation penalty', bad: true },
    twoXSwap: { text: '20% of profits only — no fees on losses', good: true },
  },
  {
    feature: 'Reaction Time',
    traditional: { text: 'Must react in milliseconds or die', bad: true },
    twoXSwap: { text: 'No reaction needed — no liquidation pressure', good: true },
  },
  {
    feature: 'Profitable on AI',
    traditional: { text: '❌ Agents get rekt on wicks', bad: true },
    twoXSwap: { text: '✅ First agent-safe leverage protocol', good: true },
  },
];

export default function ProtocolComparison() {
  return (
    <section>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: '#1e1e38', background: '#0d0d1f' }}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{ borderBottom: '1px solid #1e1e38', background: '#0a0a1a' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
            Why Agents Need 2xSwap
          </h2>
          <p className="text-xs mt-1" style={{ color: '#3a3a5a' }}>
            Traditional leverage protocols were built for humans with millisecond reaction times. Not AI agents.
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e38', background: '#080814' }}>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b', width: '25%' }}>
                  Feature
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#ff6666', width: '37.5%' }}>
                  Traditional Perps (GMX / dYdX / Binance)
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#00ff88', width: '37.5%' }}>
                  2xSwap ⚡
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: i < rows.length - 1 ? '1px solid #0f0f1f' : undefined,
                  }}
                  className="hover:bg-white/[0.01] transition-colors"
                >
                  <td className="px-5 py-3 text-sm font-medium" style={{ color: '#94a3b8' }}>
                    {row.feature}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <span
                      className="inline-flex items-center gap-2"
                      style={{ color: '#ef4444' }}
                    >
                      <span className="text-xs opacity-60">✗</span>
                      {row.traditional.text}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <span
                      className="inline-flex items-center gap-2"
                      style={{ color: '#4ade80' }}
                    >
                      <span className="text-xs opacity-70">✓</span>
                      {row.twoXSwap.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer CTA */}
        <div
          className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ borderTop: '1px solid #1e1e38', background: 'rgba(0,255,136,0.03)' }}
        >
          <p className="text-xs" style={{ color: '#64748b' }}>
            <strong style={{ color: '#94a3b8' }}>The core thesis:</strong> DeFi needs autonomous agents. Agents need protocols that don't kill them. 2xSwap is the first.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://2xswap.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all duration-150 hover:opacity-80"
              style={{ borderColor: '#00ff8840', color: '#00ff88', background: 'rgba(0,255,136,0.08)' }}
            >
              2xswap.com
            </a>
            <a
              href="https://github.com/zadrz-creator/2xswap-agent"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all duration-150 hover:opacity-80"
              style={{ borderColor: '#2a2a4a', color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
