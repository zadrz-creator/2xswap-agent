'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { equityCurve } from '@/lib/mock-data';

const LINES = [
  { key: 'combined',      name: 'Combined',       color: '#00d4ff' },
  { key: 'momentum',      name: 'Momentum',       color: '#00ff88' },
  { key: 'meanReversion', name: 'Mean-Reversion', color: '#ffd700' },
  { key: 'vwap',          name: 'VWAP',           color: '#a78bfa' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border p-3 text-xs font-mono space-y-1"
      style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }}
    >
      <p className="font-bold mb-2" style={{ color: '#64748b' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: '#e2e8f0' }}>${p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// Show only every 10th label
const tickFormatter = (_: any, index: number) => (index % 10 === 0 ? equityCurve[index]?.time ?? '' : '');

export default function EquityChart() {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
          Equity Curve
        </h2>
        <span className="text-xs font-mono" style={{ color: '#64748b' }}>Starting capital: $10,000</span>
      </div>

      <div
        className="rounded-xl border p-5"
        style={{ background: '#1a1a2e', borderColor: '#2a2a4a', boxShadow: '0 0 30px rgba(0,212,255,0.05)' }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={equityCurve} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e38" />
            <XAxis
              dataKey="time"
              tickFormatter={tickFormatter}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#2a2a4a' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${v.toLocaleString()}`}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#2a2a4a' }}
              tickLine={false}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '16px', fontSize: '12px', fontFamily: 'monospace' }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            {LINES.map(l => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.key === 'combined' ? 2.5 : 1.5}
                dot={false}
                activeDot={{ r: 4, fill: l.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
