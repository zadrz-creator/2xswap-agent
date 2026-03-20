'use client';
import { useLiveData } from '@/lib/live-data';
import { type LiqEvent } from '@/lib/mock-data';

const EVENTS: LiqEvent[] = [
  { asset: 'ETH', wick: '-8.2%', protocol: 'GMX', holdDays: 14, finalPnl: '+12.3%' },
  { asset: 'BTC', wick: '-11.4%', protocol: 'dYdX', holdDays: 9, finalPnl: '+7.8%' },
  { asset: 'ETH', wick: '-9.7%', protocol: 'Perp v2', holdDays: 21, finalPnl: '+18.1%' },
  { asset: 'BTC', wick: '-7.8%', protocol: 'GMX', holdDays: 6, finalPnl: '+5.4%' },
  { asset: 'ETH', wick: '-13.1%', protocol: 'Binance Futures', holdDays: 31, finalPnl: '+22.6%' },
  { asset: 'BTC', wick: '-6.5%', protocol: 'dYdX', holdDays: 4, finalPnl: '+3.9%' },
  { asset: 'ETH', wick: '-10.3%', protocol: 'GMX', holdDays: 18, finalPnl: '+14.7%' },
  { asset: 'BTC', wick: '-8.9%', protocol: 'Perp v2', holdDays: 12, finalPnl: '+9.2%' },
];

export default function LiquidationsAvoided() {
  const { liquidationsAvoided, liquidationEvents } = useLiveData() as any;

  const count: number = liquidationsAvoided ?? 8;
  const events: LiqEvent[] = liquidationEvents ?? EVENTS.slice(0, 4);

  return (
    <section>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#ff444430', background: '#1a0a0a' }}>
        {/* Header banner */}
        <div
          className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ borderBottom: '1px solid #ff444420', background: 'rgba(255,68,68,0.06)' }}
        >
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#ff6666' }}>
                Liquidations Avoided ⚡
              </span>
              <span className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                Positions that would be wiped on traditional 2× protocols — but survived on 2xSwap
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="px-5 py-2.5 rounded-xl text-center"
              style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid #ff444440' }}
            >
              <div
                className="font-mono font-black tabular-nums transition-all duration-500"
                style={{ fontSize: '2.5rem', lineHeight: 1, color: '#ff6666', textShadow: '0 0 20px rgba(255,68,68,0.5)' }}
              >
                {count}
              </div>
              <div className="text-xs mt-1" style={{ color: '#ff444488' }}>positions saved</div>
            </div>
            <div
              className="px-4 py-2.5 rounded-xl text-center"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid #00ff8840' }}
            >
              <div
                className="font-mono font-black tabular-nums"
                style={{ fontSize: '1.5rem', lineHeight: 1, color: '#00ff88' }}
              >
                $0
              </div>
              <div className="text-xs mt-1" style={{ color: '#00ff8860' }}>funds lost to liq.</div>
            </div>
          </div>
        </div>

        {/* Event log */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #ff444420', background: '#120a0a' }}>
                {['Asset', 'Wick', 'Would-have liquidated on', 'Agent held', 'Final P&L', 'Status'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: '#64748b' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev: LiqEvent, i: number) => (
                <tr
                  key={i}
                  style={{ borderBottom: i < events.length - 1 ? '1px solid #ff44441a' : undefined }}
                  className="hover:bg-white/[0.01] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold" style={{ color: '#00d4ff' }}>{ev.asset}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-sm font-bold px-2 py-0.5 rounded"
                      style={{ color: '#ff4444', background: 'rgba(255,68,68,0.1)' }}
                    >
                      {ev.wick}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded border font-mono"
                      style={{ color: '#ff6666', borderColor: '#ff444440', background: 'rgba(255,68,68,0.06)' }}
                    >
                      {ev.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>
                    {ev.holdDays}d
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-sm font-bold px-2 py-0.5 rounded"
                      style={{ color: '#00ff88', background: 'rgba(0,255,136,0.1)' }}
                    >
                      {ev.finalPnl}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs" style={{ color: '#4ade80' }}>Survived ✓</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer insight */}
        <div
          className="px-6 py-3 text-xs"
          style={{ borderTop: '1px solid #ff444420', background: '#120a0a', color: '#64748b' }}
        >
          💡 <strong style={{ color: '#94a3b8' }}>Why this matters for agents:</strong> Traditional protocols use liquidation as a feedback mechanism.
          2xSwap removes it entirely — agents don't need millisecond reactions to survive volatility.
          The agent decides when to exit. That's not possible anywhere else. ⚡
        </div>
      </div>
    </section>
  );
}
