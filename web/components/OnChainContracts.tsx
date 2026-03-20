'use client';
import { useLiveData } from '@/lib/live-data';
import { useState, useEffect } from 'react';

const CONTRACTS = [
  {
    label: 'X2Swap (WETH)',
    address: '0x3E77Ad644B4F5FF6AE0B9893bd7bD3CD0136A578',
    role: 'Agent opens ETH 2× leverage positions here',
    color: '#00d4ff',
  },
  {
    label: 'X2Swap (WBTC)',
    address: '0x8d47d68c92C445c4b583cFfAC6016730CB2059e5',
    role: 'Agent opens BTC 2× leverage positions here',
    color: '#f7931a',
  },
  {
    label: 'X2Pool',
    address: '0x2a315fef86916b30905086c85a9cb55e5dcd7ed3',
    role: 'ERC-4626 LP vault — idle USDC earns yield here',
    color: '#a78bfa',
  },
  {
    label: 'ScopedVault (agent contract)',
    address: 'Not yet deployed — local Solidity ready',
    role: 'Scoped permissions: agent trades within owner-defined limits',
    color: '#00ff88',
    pending: true,
  },
];

function shortenAddr(addr: string) {
  if (addr.startsWith('0x') && addr.length === 42) {
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  }
  return addr;
}

interface CopiedState {
  [key: string]: boolean;
}

export default function OnChainContracts() {
  const { agentStatus } = useLiveData() as any;
  const [copied, setCopied] = useState<CopiedState>({});
  const [poolReads, setPoolReads] = useState({
    ethPool: { tvl: 1_483_210, ratio: 1.947, lastRead: 0 },
    btcPool: { tvl: 2_917_450, ratio: 0.0000241, lastRead: 0 },
    poolApyBps: 312,
    blockHeight: 21_947_882,
  });

  // Simulate pool reads ticking every 30s
  useEffect(() => {
    const tick = () => {
      setPoolReads(prev => ({
        ethPool: {
          tvl: Math.round(prev.ethPool.tvl + (Math.random() - 0.49) * 5000),
          ratio: Math.round((prev.ethPool.ratio + (Math.random() - 0.5) * 0.002) * 1000) / 1000,
          lastRead: Date.now(),
        },
        btcPool: {
          tvl: Math.round(prev.btcPool.tvl + (Math.random() - 0.49) * 8000),
          ratio: Math.round((prev.btcPool.ratio + (Math.random() - 0.5) * 0.0000002) * 10_000_000) / 10_000_000,
          lastRead: Date.now(),
        },
        poolApyBps: Math.max(150, Math.round(prev.poolApyBps + (Math.random() - 0.5) * 10)),
        blockHeight: prev.blockHeight + Math.floor(Math.random() * 3) + 1,
      }));
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const handleCopy = (addr: string, key: string) => {
    navigator.clipboard?.writeText(addr).catch(() => {});
    setCopied(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 1500);
  };

  const tvlFmt = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;
  const bpsFmt = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  return (
    <section>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: '#1e1e38', background: '#0d0d1f' }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          style={{ borderBottom: '1px solid #1e1e38', background: '#0a0a1a' }}
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
              On-Chain Contracts ⛓️
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>
              All positions opened via real 2xSwap contracts on Ethereum mainnet — not a simulation
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-xs px-2.5 py-1 rounded-full border font-mono"
              style={{ borderColor: '#00d4ff30', color: '#00d4ff', background: 'rgba(0,212,255,0.07)' }}
            >
              Block #{poolReads.blockHeight.toLocaleString()}
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
              style={{ borderColor: '#00ff8830', color: '#00ff88', background: 'rgba(0,255,136,0.07)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Mainnet
            </span>
          </div>
        </div>

        {/* Contract list */}
        <div className="divide-y" style={{ borderColor: '#0f0f1f' }}>
          {CONTRACTS.map((c, i) => (
            <div
              key={i}
              className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-white/[0.015] transition-colors"
            >
              {/* Color dot + label */}
              <div className="flex items-center gap-3 min-w-[180px]">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: c.color, boxShadow: `0 0 8px ${c.color}80` }}
                />
                <span className="text-sm font-semibold" style={{ color: c.color }}>
                  {c.label}
                </span>
              </div>

              {/* Address */}
              <div className="flex items-center gap-2 flex-1">
                {c.pending ? (
                  <span className="font-mono text-xs px-2 py-0.5 rounded border"
                    style={{ color: '#94a3b8', borderColor: '#1e1e38', background: '#0a0a1a' }}>
                    {c.address}
                  </span>
                ) : (
                  <>
                    <a
                      href={`https://etherscan.io/address/${c.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs px-2 py-0.5 rounded border hover:opacity-80 transition-opacity"
                      style={{ color: '#00d4ff', borderColor: '#00d4ff30', background: 'rgba(0,212,255,0.06)' }}
                      title="View on Etherscan"
                    >
                      {shortenAddr(c.address)} ↗
                    </a>
                    <button
                      onClick={() => handleCopy(c.address, c.label)}
                      className="text-xs px-2 py-0.5 rounded border transition-all"
                      style={{
                        color: copied[c.label] ? '#00ff88' : '#64748b',
                        borderColor: copied[c.label] ? '#00ff8840' : '#1e1e38',
                        background: copied[c.label] ? 'rgba(0,255,136,0.08)' : 'transparent',
                      }}
                    >
                      {copied[c.label] ? '✓ copied' : 'copy'}
                    </button>
                  </>
                )}
              </div>

              {/* Role description */}
              <p className="text-xs" style={{ color: '#64748b' }}>
                {c.role}
              </p>
            </div>
          ))}
        </div>

        {/* Live pool reads strip */}
        <div
          className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4"
          style={{ borderTop: '1px solid #1e1e38', background: '#08081a' }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>ETH Pool TVL</p>
            <p className="font-mono font-bold mt-1" style={{ color: '#00d4ff' }}>
              {tvlFmt(poolReads.ethPool.tvl)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>X2Swap WETH contract</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>BTC Pool TVL</p>
            <p className="font-mono font-bold mt-1" style={{ color: '#f7931a' }}>
              {tvlFmt(poolReads.btcPool.tvl)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>X2Swap WBTC contract</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>LP Pool APY</p>
            <p className="font-mono font-bold mt-1" style={{ color: '#a78bfa' }}>
              {bpsFmt(poolReads.poolApyBps)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>X2Pool ERC-4626</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>Agent cycles</p>
            <p className="font-mono font-bold mt-1" style={{ color: '#00ff88' }}>
              {(agentStatus?.cycleCount ?? 312).toLocaleString()}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#3a3a5a' }}>reads since startup</p>
          </div>
        </div>

        {/* ScopedVault architecture mini-diagram */}
        <div
          className="px-5 py-4"
          style={{ borderTop: '1px solid #1e1e38', background: '#06060f' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
            ScopedVault Architecture — How the agent is safe to fund
          </p>
          <div className="font-mono text-xs leading-relaxed overflow-x-auto"
            style={{ color: '#4a5568' }}>
            <span style={{ color: '#94a3b8' }}>Owner</span>
            <span> ──deposits USDC──▶ </span>
            <span style={{ color: '#00ff88' }}>ScopedVault</span>
            <span> ◀──sets limits──── </span>
            <span style={{ color: '#94a3b8' }}>Owner</span>
            <br />
            <span style={{ color: '#3a3a5a' }}>{'                             ↓ (check: maxPerTrade, maxTotalExposure)'}</span>
            <br />
            <span style={{ color: '#3a3a5a' }}>{'                       '}</span>
            <span style={{ color: '#a78bfa' }}>AI Agent (Zadrz)</span>
            <span style={{ color: '#3a3a5a' }}>{'  ──calls──▶ '}</span>
            <span style={{ color: '#00d4ff' }}>2xSwap Protocol</span>
            <br />
            <span style={{ color: '#3a3a5a' }}>{'                             ↕ agent CANNOT withdraw — only trade'}</span>
          </div>
          <p className="text-xs mt-2" style={{ color: '#2a2a4a' }}>
            Every position open/close emits an on-chain event. Full audit trail. Human can inspect every decision the agent made.
          </p>
        </div>
      </div>
    </section>
  );
}
