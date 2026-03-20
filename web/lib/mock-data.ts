export type Signal = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
export type Action = 'OPEN' | 'CLOSE' | 'HOLD';

export interface MarketSignal {
  asset: string;
  price: number;
  rsi: number;
  vwapDeviation: number;
  bbPosition: number;
  volatility: number;
  signal: Signal;
  priceChange24h: number;
}

export interface Position {
  id: string;
  asset: string;
  amount: number;
  openPrice: number;
  currentPrice: number;
  pnlPct: number;
  ageHours: number;
  strategy: string;
}

export interface Decision {
  timestamp: string;
  action: Action;
  asset: string;
  reasoning: string;
}

export interface BacktestResult {
  strategy: string;
  trades: number;
  winRate: number;
  pnlPct: number;
  maxDD: number;
  sharpe: number;
  liquidationsAvoided: number;
}

export interface LiqEvent {
  asset: string;
  wick: string;
  protocol: string;
  holdDays: number;
  finalPnl: string;
}

export interface EquityPoint {
  time: string;
  momentum: number;
  meanReversion: number;
  vwap: number;
  combined: number;
}

// ── Agent Status ──────────────────────────────────────────────────────────────
export const agentStatus = {
  mode: 'DEMO' as 'DEMO' | 'MONITOR' | 'LIVE',
  wallet: '0x7f3A...d4E9',
  uptime: '4h 23m',
  cycleCount: 312,
};

// ── Market Signals ────────────────────────────────────────────────────────────
export const marketSignals: MarketSignal[] = [
  {
    asset: 'ETH',
    price: 2051.34,
    rsi: 42.3,
    vwapDeviation: -0.8,
    bbPosition: 0.28,
    volatility: 3.2,
    signal: 'BUY',
    priceChange24h: -1.4,
  },
  {
    asset: 'BTC',
    price: 87_482.5,
    rsi: 55.8,
    vwapDeviation: 0.4,
    bbPosition: 0.55,
    volatility: 2.1,
    signal: 'NEUTRAL',
    priceChange24h: 0.7,
  },
];

// ── Active Positions ──────────────────────────────────────────────────────────
export const activePositions: Position[] = [
  {
    id: 'P-0042',
    asset: 'ETH',
    amount: 1.5,
    openPrice: 1987.2,
    currentPrice: 2051.34,
    pnlPct: 3.23,
    ageHours: 6.4,
    strategy: 'Mean-Reversion',
  },
  {
    id: 'P-0041',
    asset: 'BTC',
    amount: 0.05,
    openPrice: 88_800.0,
    currentPrice: 87_482.5,
    pnlPct: -1.48,
    ageHours: 11.2,
    strategy: 'Momentum',
  },
];

// ── Equity Curve ──────────────────────────────────────────────────────────────
function genEquity(): EquityPoint[] {
  const points: EquityPoint[] = [];
  let mom = 10000, mr = 10000, vwap = 10000, combined = 10000;
  const now = Date.now();
  for (let i = 60; i >= 0; i--) {
    const t = new Date(now - i * 10 * 60 * 1000);
    const hh = t.getHours().toString().padStart(2, '0');
    const mm = t.getMinutes().toString().padStart(2, '0');
    mom      += (Math.random() - 0.46) * 30;
    mr       += (Math.random() - 0.48) * 18;
    vwap     += (Math.random() - 0.47) * 15;
    combined += (Math.random() - 0.45) * 35;
    points.push({
      time: `${hh}:${mm}`,
      momentum: Math.round(mom * 100) / 100,
      meanReversion: Math.round(mr * 100) / 100,
      vwap: Math.round(vwap * 100) / 100,
      combined: Math.round(combined * 100) / 100,
    });
  }
  // Nudge ending values to roughly match backtest PnL
  const last = points[points.length - 1];
  last.momentum = 11480;
  last.meanReversion = 10520;
  last.vwap = 10440;
  last.combined = 11640;
  return points;
}
export const equityCurve: EquityPoint[] = genEquity();

// ── Recent Decisions ──────────────────────────────────────────────────────────
export const recentDecisions: Decision[] = [
  { timestamp: '08:47:12', action: 'HOLD',  asset: 'ETH', reasoning: 'RSI 42.3 — oversold watch zone, waiting for momentum confirmation' },
  { timestamp: '08:32:05', action: 'HOLD',  asset: 'BTC', reasoning: 'VWAP +0.4% deviation, price consolidating near BB midline' },
  { timestamp: '08:15:44', action: 'OPEN',  asset: 'ETH', reasoning: 'Mean-reversion signal: BB position 0.18, RSI divergence detected' },
  { timestamp: '07:58:31', action: 'CLOSE', asset: 'BTC', reasoning: 'Momentum target reached +2.1%, exiting to lock profit' },
  { timestamp: '07:41:19', action: 'OPEN',  asset: 'BTC', reasoning: 'Momentum breakout: price above VWAP +1.2%, RSI 62 with rising volume' },
  { timestamp: '07:24:03', action: 'HOLD',  asset: 'ETH', reasoning: 'Volatility 3.2% — within acceptable range, no signal change' },
  { timestamp: '07:10:55', action: 'CLOSE', asset: 'ETH', reasoning: 'BB position 0.85, overbought — mean-reversion exit triggered' },
  { timestamp: '06:55:22', action: 'HOLD',  asset: 'BTC', reasoning: 'Neutral zone: RSI 51.4, VWAP deviation < 0.1%' },
  { timestamp: '06:38:47', action: 'OPEN',  asset: 'ETH', reasoning: 'VWAP strategy: price -1.1% below VWAP, mean reversion likely' },
  { timestamp: '06:21:14', action: 'CLOSE', asset: 'BTC', reasoning: 'Stop-loss at -2.5% triggered, momentum reversed' },
  { timestamp: '06:05:30', action: 'OPEN',  asset: 'BTC', reasoning: 'Strong buy: RSI 38, BB position 0.12, VWAP -2.3% deviation' },
  { timestamp: '05:48:09', action: 'HOLD',  asset: 'ETH', reasoning: 'Cycle skip: insufficient signal strength (score 0.41 < threshold 0.6)' },
  { timestamp: '05:33:02', action: 'CLOSE', asset: 'ETH', reasoning: 'Profit target +3.8% reached, mean-reversion complete' },
  { timestamp: '05:17:45', action: 'OPEN',  asset: 'ETH', reasoning: 'Momentum: RSI crossing 45 from below, VWAP reclaim confirmed' },
  { timestamp: '05:01:22', action: 'HOLD',  asset: 'BTC', reasoning: 'High volatility window (4.8%) — agent pausing new entries' },
];

// ── Backtest Results ──────────────────────────────────────────────────────────
export const backtestResults: BacktestResult[] = [
  { strategy: 'Momentum',       trades: 7,  winRate: 71.4, pnlPct: 14.8, maxDD: -3.2, sharpe: 2.81, liquidationsAvoided: 3 },
  { strategy: 'Mean-Reversion', trades: 9,  winRate: 77.8, pnlPct:  5.2, maxDD: -4.2, sharpe: 1.37, liquidationsAvoided: 2 },
  { strategy: 'VWAP',           trades: 5,  winRate: 80.0, pnlPct:  4.4, maxDD: -7.0, sharpe: 0.95, liquidationsAvoided: 1 },
  { strategy: 'Combined',       trades: 42, winRate: 71.4, pnlPct: 16.4, maxDD: -4.3, sharpe: 3.42, liquidationsAvoided: 8 },
];
