'use client';
/**
 * LiveDataContext — simulates real-time agent data updates.
 * Prices drift, RSI shifts, new decisions appear, equity grows.
 * Runs entirely client-side — works on static GitHub Pages.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  type MarketSignal,
  type Position,
  type Decision,
  type BacktestResult,
  type EquityPoint,
  type LiqEvent,
  marketSignals as initSignals,
  activePositions as initPositions,
  recentDecisions as initDecisions,
  backtestResults,
  equityCurve as initCurve,
  agentStatus as initStatus,
} from './mock-data';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentStatus {
  mode: 'DEMO' | 'MONITOR' | 'LIVE';
  wallet: string;
  uptime: string;
  cycleCount: number;
}

interface LiveState {
  signals: MarketSignal[];
  positions: Position[];
  decisions: Decision[];
  backtestResults: BacktestResult[];
  equityCurve: EquityPoint[];
  agentStatus: AgentStatus;
  liquidationsAvoided: number;
  liquidationEvents: LiqEvent[];
  lastTick: number;
}

interface LiveCtx extends LiveState {
  isLive: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const DECISION_POOL: Array<{ action: Decision['action']; asset: string; reasoning: string }> = [
  { action: 'HOLD',  asset: 'ETH', reasoning: 'RSI 41.2 — oversold watch zone, awaiting momentum confirmation' },
  { action: 'HOLD',  asset: 'BTC', reasoning: 'VWAP deviation within ±0.3%, price consolidating near midline' },
  { action: 'OPEN',  asset: 'ETH', reasoning: 'Mean-reversion: BB position 0.15, RSI divergence detected' },
  { action: 'CLOSE', asset: 'BTC', reasoning: 'Momentum target +2.3% reached, exiting to lock profit' },
  { action: 'OPEN',  asset: 'BTC', reasoning: 'Momentum breakout: price above VWAP +1.4%, RSI 63 rising' },
  { action: 'HOLD',  asset: 'ETH', reasoning: 'Volatility 3.4% — within acceptable range, no signal change' },
  { action: 'CLOSE', asset: 'ETH', reasoning: 'BB position 0.88, overbought — mean-reversion exit triggered' },
  { action: 'OPEN',  asset: 'ETH', reasoning: 'VWAP strategy: price -1.3% below VWAP, mean reversion likely' },
  { action: 'HOLD',  asset: 'BTC', reasoning: 'Insufficient signal strength (score 0.38 < threshold 0.60)' },
  { action: 'CLOSE', asset: 'ETH', reasoning: 'Profit target +4.1% reached, mean-reversion cycle complete' },
  { action: 'OPEN',  asset: 'BTC', reasoning: 'Strong buy: RSI 36, BB position 0.11, VWAP -2.6% deviation' },
  { action: 'HOLD',  asset: 'BTC', reasoning: 'High volatility window (5.1%) — agent pausing new entries' },
  { action: 'HOLD',  asset: 'ETH', reasoning: 'Cycle skip: neutral zone RSI 49.8, VWAP flat ±0.05%' },
  { action: 'OPEN',  asset: 'ETH', reasoning: 'Momentum: RSI crossing 45 from below, VWAP reclaim confirmed' },
  { action: 'CLOSE', asset: 'BTC', reasoning: 'Stop-loss -2.5% triggered, trend reversed — protecting capital' },
  { action: 'OPEN',  asset: 'BTC', reasoning: 'Combined signal score 0.87: RSI 38 + BB 0.14 + VWAP -2.1%' },
  { action: 'HOLD',  asset: 'ETH', reasoning: 'Waiting for volume confirmation before entering mean-reversion' },
  { action: 'CLOSE', asset: 'ETH', reasoning: 'Position age 12h — time-based exit triggered, PnL +2.8%' },
];

function getSignal(rsi: number, vwapDev: number, bbPos: number): MarketSignal['signal'] {
  const score = (100 - rsi) / 100 * 0.4 + (-vwapDev) / 3 * 0.3 + (1 - bbPos) * 0.3;
  if (score > 0.65)  return 'STRONG BUY';
  if (score > 0.5)   return 'BUY';
  if (score > 0.35)  return 'NEUTRAL';
  if (score > 0.2)   return 'SELL';
  return 'STRONG SELL';
}

function formatUptime(startMs: number) {
  const elapsed = Date.now() - startMs;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ── Context ───────────────────────────────────────────────────────────────────
const LiveDataContext = createContext<LiveCtx | null>(null);

export function useLiveData(): LiveCtx {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData must be used inside LiveDataProvider');
  return ctx;
}

// ── Liquidation event data (module-level constants) ───────────────────────────
const INIT_LIQ_EVENTS: LiqEvent[] = [
  { asset: 'ETH', wick: '-8.2%', protocol: 'GMX', holdDays: 14, finalPnl: '+12.3%' },
  { asset: 'BTC', wick: '-11.4%', protocol: 'dYdX', holdDays: 9, finalPnl: '+7.8%' },
  { asset: 'ETH', wick: '-9.7%', protocol: 'Perp v2', holdDays: 21, finalPnl: '+18.1%' },
  { asset: 'BTC', wick: '-7.8%', protocol: 'GMX', holdDays: 6, finalPnl: '+5.4%' },
];

const LIQ_POOL: LiqEvent[] = [
  { asset: 'ETH', wick: '-13.1%', protocol: 'Binance Futures', holdDays: 31, finalPnl: '+22.6%' },
  { asset: 'BTC', wick: '-6.5%', protocol: 'dYdX', holdDays: 4, finalPnl: '+3.9%' },
  { asset: 'ETH', wick: '-10.3%', protocol: 'GMX', holdDays: 18, finalPnl: '+14.7%' },
  { asset: 'BTC', wick: '-8.9%', protocol: 'Perp v2', holdDays: 12, finalPnl: '+9.2%' },
  { asset: 'ETH', wick: '-7.1%', protocol: 'Binance Futures', holdDays: 8, finalPnl: '+6.3%' },
  { asset: 'BTC', wick: '-15.2%', protocol: 'GMX', holdDays: 42, finalPnl: '+31.4%' },
];

// ── Provider ──────────────────────────────────────────────────────────────────
export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const startTime = useRef(Date.now() - 4 * 3600_000 - 23 * 60_000); // match "4h 23m" initial uptime
  const cycleRef = useRef(initStatus.cycleCount);
  const decisionRef = useRef(0);
  const liqRef = useRef(0); // ticks since last liquidation event

  const [state, setState] = useState<LiveState>({
    signals: initSignals,
    positions: initPositions,
    decisions: initDecisions,
    backtestResults,
    equityCurve: initCurve,
    agentStatus: { ...initStatus },
    liquidationsAvoided: 4,
    liquidationEvents: INIT_LIQ_EVENTS,
    lastTick: Date.now(),
  });

  const tick = useCallback(() => {
    setState(prev => {
      // ── Drift prices & indicators ──────────────────────────────────────────
      const signals: MarketSignal[] = prev.signals.map(s => {
        const priceDelta = s.price * rand(-0.0008, 0.0008);
        const newPrice = Math.round((s.price + priceDelta) * 100) / 100;
        const newRsi = clamp(s.rsi + rand(-0.8, 0.8), 20, 85);
        const newVwap = clamp(s.vwapDeviation + rand(-0.1, 0.1), -3, 3);
        const newBb = clamp(s.bbPosition + rand(-0.03, 0.03), 0.05, 0.95);
        const newVol = clamp(s.volatility + rand(-0.05, 0.05), 1, 7);
        const newChange = clamp(s.priceChange24h + rand(-0.05, 0.05), -8, 8);
        return {
          ...s,
          price: newPrice,
          rsi: Math.round(newRsi * 10) / 10,
          vwapDeviation: Math.round(newVwap * 100) / 100,
          bbPosition: Math.round(newBb * 100) / 100,
          volatility: Math.round(newVol * 10) / 10,
          priceChange24h: Math.round(newChange * 10) / 10,
          signal: getSignal(newRsi, newVwap, newBb),
        };
      });

      // ── Update positions (price follows signal price, PnL recalculated) ───
      const positions: Position[] = prev.positions.map(pos => {
        const sig = signals.find(s => s.asset === pos.asset);
        if (!sig) return pos;
        const currentPrice = sig.price;
        const pnlPct = Math.round(((currentPrice - pos.openPrice) / pos.openPrice) * 10000) / 100;
        return { ...pos, currentPrice, pnlPct, ageHours: Math.round((pos.ageHours + 1 / 60) * 10) / 10 };
      });

      // ── Grow equity curve ─────────────────────────────────────────────────
      const last = prev.equityCurve[prev.equityCurve.length - 1];
      const d = new Date();
      const newPoint: EquityPoint = {
        time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
        momentum:     Math.round((last.momentum     + rand(-15, 20)) * 100) / 100,
        meanReversion:Math.round((last.meanReversion + rand(-8, 12)) * 100) / 100,
        vwap:         Math.round((last.vwap          + rand(-6, 10)) * 100) / 100,
        combined:     Math.round((last.combined      + rand(-10, 25)) * 100) / 100,
      };
      // Keep last 90 points
      const equityCurve = [...prev.equityCurve.slice(-89), newPoint];

      // ── Maybe add a new decision (every ~30s = every 3 ticks) ─────────────
      let decisions = prev.decisions;
      decisionRef.current++;
      if (decisionRef.current % 3 === 0) {
        const pick = DECISION_POOL[Math.floor(Math.random() * DECISION_POOL.length)];
        const newDec: Decision = { ...pick, timestamp: now() };
        decisions = [newDec, ...prev.decisions.slice(0, 19)];
      }

      // ── Increment cycle ───────────────────────────────────────────────────
      cycleRef.current++;
      const agentStatus: AgentStatus = {
        ...prev.agentStatus,
        uptime: formatUptime(startTime.current),
        cycleCount: cycleRef.current,
      };

      // ── Maybe add a liquidation event (every ~2 min = every 12 ticks) ────
      let liquidationsAvoided = prev.liquidationsAvoided;
      let liquidationEvents = prev.liquidationEvents;
      liqRef.current++;
      if (liqRef.current % 12 === 0) {
        const pick = LIQ_POOL[Math.floor(Math.random() * LIQ_POOL.length)];
        liquidationsAvoided = prev.liquidationsAvoided + 1;
        liquidationEvents = [pick, ...prev.liquidationEvents.slice(0, 7)];
      }

      return { ...prev, signals, positions, equityCurve, decisions, agentStatus, liquidationsAvoided, liquidationEvents, lastTick: Date.now() };
    });
  }, []);

  useEffect(() => {
    // Tick every 10 seconds
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [tick]);

  return (
    <LiveDataContext.Provider value={{ ...state, isLive: true }}>
      {children}
    </LiveDataContext.Provider>
  );
}
