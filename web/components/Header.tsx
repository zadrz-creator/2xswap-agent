'use client';
import { agentStatus } from '@/lib/mock-data';

const modeBadge: Record<string, string> = {
  DEMO: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  MONITOR: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  LIVE: 'bg-green-500/20 text-green-400 border-green-500/40',
};

export default function Header() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b"
      style={{ background: '#0d0d1f', borderColor: '#2a2a4a' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: '#00d4ff' }}
            >
              2xSwap Autonomous Trading Agent
            </h1>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Synthesis Hackathon 2026 — live dashboard
            </p>
          </div>
        </div>

        {/* Right: Status pills */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode badge */}
          <span
            className={`px-3 py-1 text-xs font-bold rounded-full border font-mono ${modeBadge[agentStatus.mode]}`}
          >
            {agentStatus.mode}
          </span>

          {/* Wallet */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>
              {agentStatus.wallet}
            </span>
          </div>

          {/* Uptime */}
          <div className="flex items-center gap-1">
            <span className="text-xs" style={{ color: '#64748b' }}>uptime</span>
            <span className="text-xs font-mono font-semibold" style={{ color: '#e2e8f0' }}>
              {agentStatus.uptime}
            </span>
          </div>

          {/* Cycle count */}
          <div
            className="px-2 py-0.5 rounded border font-mono text-xs"
            style={{ borderColor: '#2a2a4a', color: '#00d4ff' }}
          >
            cycle #{agentStatus.cycleCount}
          </div>
        </div>
      </div>
    </header>
  );
}
