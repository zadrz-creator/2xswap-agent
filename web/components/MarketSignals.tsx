'use client';
import { useLiveData } from '@/lib/live-data';
import { type MarketSignal, type Signal } from '@/lib/mock-data';

const signalColors: Record<Signal, string> = {
  'STRONG BUY':  '#00ff88',
  'BUY':         '#4ade80',
  'NEUTRAL':     '#ffd700',
  'SELL':        '#f97316',
  'STRONG SELL': '#ff4444',
};

const signalBg: Record<Signal, string> = {
  'STRONG BUY':  'rgba(0,255,136,0.12)',
  'BUY':         'rgba(74,222,128,0.10)',
  'NEUTRAL':     'rgba(255,215,0,0.10)',
  'SELL':        'rgba(249,115,22,0.10)',
  'STRONG SELL': 'rgba(255,68,68,0.12)',
};

function rsiColor(rsi: number) {
  if (rsi < 30) return '#00ff88';
  if (rsi < 40) return '#4ade80';
  if (rsi < 60) return '#ffd700';
  if (rsi < 70) return '#f97316';
  return '#ff4444';
}

function RSIGauge({ value }: { value: number }) {
  const pct = (value / 100) * 100;
  const color = rsiColor(value);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: '#64748b' }}>
        <span>RSI</span>
        <span className="font-mono font-bold" style={{ color }}>{value.toFixed(1)}</span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#0a0a0a' }}>
        {/* Zones */}
        <div className="absolute inset-y-0 left-0 w-[30%]" style={{ background: 'rgba(0,255,136,0.15)' }} />
        <div className="absolute inset-y-0 left-[30%] w-[40%]" style={{ background: 'rgba(255,215,0,0.08)' }} />
        <div className="absolute inset-y-0 left-[70%] w-[30%]" style={{ background: 'rgba(255,68,68,0.15)' }} />
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, opacity: 0.7 }}
        />
        {/* Needle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded transition-all duration-700"
          style={{ left: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }}
        />
      </div>
      <div className="flex justify-between text-xs mt-0.5" style={{ color: '#3a3a5a' }}>
        <span>0</span><span>oversold</span><span>neutral</span><span>overbought</span><span>100</span>
      </div>
    </div>
  );
}

function BBBar({ position }: { position: number }) {
  const color = position < 0.3 ? '#00ff88' : position > 0.7 ? '#ff4444' : '#ffd700';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: '#64748b' }}>
        <span>BB Position</span>
        <span className="font-mono font-bold" style={{ color }}>{position.toFixed(2)}</span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#0a0a0a' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${position * 100}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-xs mt-0.5" style={{ color: '#3a3a5a' }}>
        <span>lower</span><span>middle</span><span>upper</span>
      </div>
    </div>
  );
}

function Card({ s }: { s: MarketSignal }) {
  const sc = signalColors[s.signal];
  const vwapPositive = s.vwapDeviation >= 0;
  const pricePositive = s.priceChange24h >= 0;

  return (
    <div
      className="flex-1 rounded-xl border p-5 space-y-4"
      style={{
        background: '#1a1a2e',
        borderColor: '#2a2a4a',
        boxShadow: `0 0 30px rgba(0,212,255,0.05)`,
      }}
    >
      {/* Asset header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold" style={{ color: '#00d4ff' }}>{s.asset}</span>
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded transition-colors duration-500"
              style={{ color: pricePositive ? '#00ff88' : '#ff4444', background: pricePositive ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)' }}
            >
              {pricePositive ? '+' : ''}{s.priceChange24h.toFixed(1)}% 24h
            </span>
          </div>
          <div className="font-mono text-2xl font-bold mt-1 transition-all duration-500" style={{ color: '#e2e8f0' }}>
            ${s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-center transition-colors duration-500"
          style={{ background: signalBg[s.signal], color: sc, border: `1px solid ${sc}40` }}
        >
          {s.signal}
        </div>
      </div>

      {/* RSI */}
      <RSIGauge value={s.rsi} />

      {/* BB Position */}
      <BBBar position={s.bbPosition} />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-2.5" style={{ background: '#0d0d1f' }}>
          <div className="text-xs mb-1" style={{ color: '#64748b' }}>VWAP Dev</div>
          <div
            className="font-mono text-sm font-bold transition-colors duration-500"
            style={{ color: vwapPositive ? '#f97316' : '#4ade80' }}
          >
            {vwapPositive ? '+' : ''}{s.vwapDeviation.toFixed(2)}%
          </div>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: '#0d0d1f' }}>
          <div className="text-xs mb-1" style={{ color: '#64748b' }}>Volatility</div>
          <div className="font-mono text-sm font-bold" style={{ color: '#ffd700' }}>
            {s.volatility.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketSignals() {
  const { signals } = useLiveData();
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
        Market Signals
      </h2>
      <div className="flex flex-col sm:flex-row gap-4">
        {signals.map(s => <Card key={s.asset} s={s} />)}
      </div>
    </section>
  );
}
