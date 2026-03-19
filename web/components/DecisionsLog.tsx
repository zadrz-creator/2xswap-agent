'use client';
import { recentDecisions, type Action } from '@/lib/mock-data';

const actionStyle: Record<Action, { color: string; bg: string; border: string }> = {
  OPEN:  { color: '#00ff88', bg: 'rgba(0,255,136,0.12)',  border: 'rgba(0,255,136,0.3)' },
  CLOSE: { color: '#ff4444', bg: 'rgba(255,68,68,0.12)',   border: 'rgba(255,68,68,0.3)' },
  HOLD:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
};

export default function DecisionsLog() {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
          Recent Decisions
        </h2>
        <span className="text-xs font-mono" style={{ color: '#64748b' }}>last {recentDecisions.length}</span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }}
      >
        <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: '360px' }}>
          {recentDecisions.map((d, i) => {
            const st = actionStyle[d.action];
            return (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: i < recentDecisions.length - 1 ? '1px solid #1e1e38' : undefined }}
              >
                {/* Timestamp */}
                <span
                  className="font-mono text-xs shrink-0 mt-0.5 pt-0.5"
                  style={{ color: '#64748b', minWidth: '60px' }}
                >
                  {d.timestamp}
                </span>

                {/* Action badge */}
                <span
                  className="text-xs font-bold font-mono px-2 py-0.5 rounded shrink-0 mt-0.5"
                  style={{
                    color: st.color,
                    background: st.bg,
                    border: `1px solid ${st.border}`,
                    minWidth: '52px',
                    textAlign: 'center',
                  }}
                >
                  {d.action}
                </span>

                {/* Asset */}
                <span
                  className="font-mono text-xs font-bold shrink-0 mt-0.5 pt-0.5"
                  style={{ color: '#00d4ff', minWidth: '32px' }}
                >
                  {d.asset}
                </span>

                {/* Reasoning */}
                <span className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                  {d.reasoning}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
