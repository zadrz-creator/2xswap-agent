/**
 * Backtesting Engine
 *
 * Replays historical price data against trading strategies to measure
 * performance before deploying capital. Demonstrates the agent's
 * decision-making process on historical data.
 *
 * Key insight: 2xSwap's no-liquidation design means we can hold positions
 * through drawdowns — the backtest captures this advantage explicitly.
 */

import { evaluateStrategy, ActivePosition, StrategyState, TradeAction } from '../strategies/momentum';
import { evaluateMeanReversionStrategy } from '../strategies/mean-reversion';
import { createPriceHistory, addPrice, getAssetPrices, PriceHistory } from '../utils/prices';
import { computeSignals } from '../utils/indicators';

export type StrategyName = 'momentum' | 'mean-reversion' | 'combined';

export interface PriceBar {
  timestamp: number;
  eth: number;
  btc: number;
}

export interface BacktestTrade {
  id: number;
  asset: 'eth' | 'btc';
  openBar: number;
  closeBar: number;
  openPrice: number;
  closePrice: number;
  openTime: number;
  closeTime: number;
  pnlPct: number;
  pnlUsdc: number;
  positionSize: number;
  reason: string;
  closeReason: string;
  /** Days held */
  daysHeld: number;
  /** Would have been liquidated on a normal leverage protocol? */
  wouldBeliquidated: boolean;
}

export interface BacktestResult {
  strategy: StrategyName;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnlUsdc: number;
  totalPnlPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldDays: number;
  avgWinPct: number;
  avgLossPct: number;
  liquidationsAvoided: number;
  startCapital: number;
  endCapital: number;
  trades: BacktestTrade[];
  equityCurve: { bar: number; equity: number }[];
}

interface BacktestPosition {
  id: number;
  asset: 'eth' | 'btc';
  openBar: number;
  openPrice: number;
  openAmount: number;
  openTime: number;
  reason: string;
}

export class BacktestEngine {
  private readonly positionSize: number;
  private readonly maxPositions: number;

  constructor(
    private readonly bars: PriceBar[],
    private readonly strategy: StrategyName,
    private readonly initialCapital = 1000,
    positionSizePct = 0.25,
    maxPositions = 4,
  ) {
    this.positionSize = initialCapital * positionSizePct;
    this.maxPositions = maxPositions;
  }

  run(): BacktestResult {
    const trades: BacktestTrade[] = [];
    const equityCurve: { bar: number; equity: number }[] = [];
    const activePositions: BacktestPosition[] = [];
    let capital = this.initialCapital;
    let tradeId = 0;
    let maxEquity = capital;
    let maxDrawdown = 0;

    // Need enough history for indicators
    const WARMUP = 30;

    const history: PriceHistory = createPriceHistory(this.bars.length + 10);

    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i];
      addPrice(history, { eth: bar.eth, btc: bar.btc, timestamp: bar.timestamp });

      // Skip warmup
      if (i < WARMUP) continue;

      // Current prices from history
      const ethPrices = getAssetPrices(history, 'eth');
      const btcPrices = getAssetPrices(history, 'btc');

      // --- Check closes on active positions ---
      const toClose: { pos: BacktestPosition; reason: string }[] = [];

      for (const pos of activePositions) {
        const currentPrice = pos.asset === 'eth' ? bar.eth : bar.btc;
        const pnlPct = ((currentPrice - pos.openPrice) / pos.openPrice) * 100;
        const daysOpen = (bar.timestamp - pos.openTime) / 86400000;

        // Take profit
        if (pnlPct >= 15) {
          toClose.push({ pos, reason: `Take profit: +${pnlPct.toFixed(1)}%` });
          continue;
        }
        // Stop loss (soft — no liquidation in 2xSwap)
        if (pnlPct <= -10) {
          toClose.push({ pos, reason: `Soft stop: ${pnlPct.toFixed(1)}%` });
          continue;
        }
        // Near expiry
        if (daysOpen > 335) {
          toClose.push({ pos, reason: 'Approaching 1-year expiry' });
          continue;
        }

        // Strategy-based close
        const strategyState: StrategyState = {
          activePositions: activePositions.map((p) => ({
            id: BigInt(p.id),
            asset: p.asset,
            openPrice: p.openPrice,
            openAmount: p.openAmount,
            openTime: p.openTime,
          })),
          maxPositions: this.maxPositions,
          maxPerPosition: this.positionSize,
          maxTotalExposure: this.initialCapital,
        };

        const actions = this.getStrategyActions(history, strategyState);
        const closeAction = actions.find(
          (a): a is Extract<TradeAction, { type: 'close' }> =>
            a.type === 'close' && a.positionId === BigInt(pos.id)
        );
        if (closeAction) {
          toClose.push({ pos, reason: closeAction.reason });
        }
      }

      // Execute closes
      for (const { pos, reason } of toClose) {
        const currentPrice = pos.asset === 'eth' ? bar.eth : bar.btc;
        const pnlPct = ((currentPrice - pos.openPrice) / pos.openPrice) * 100;
        const pnlUsdc = pos.openAmount * (pnlPct / 100) * 2; // 2x leverage
        const daysHeld = (bar.timestamp - pos.openTime) / 86400000;

        // Would a standard protocol (125% collateral, 3% funding/month) have liquidated?
        // Liquidation at -20% for 5x leverage typical, or -8% for 2x with standard protocols
        const wouldBeliquidated = pnlPct <= -8; // Below 8% threshold common for 2x leverage elsewhere

        trades.push({
          id: pos.id,
          asset: pos.asset,
          openBar: pos.openBar,
          closeBar: i,
          openPrice: pos.openPrice,
          closePrice: currentPrice,
          openTime: pos.openTime,
          closeTime: bar.timestamp,
          pnlPct,
          pnlUsdc,
          positionSize: pos.openAmount,
          reason: pos.reason,
          closeReason: reason,
          daysHeld,
          wouldBeliquidated,
        } as BacktestTrade);

        capital += pnlUsdc;

        // Remove from active
        const idx = activePositions.indexOf(pos);
        if (idx > -1) activePositions.splice(idx, 1);
      }

      // --- Check for new entries ---
      if (activePositions.length < this.maxPositions && capital > this.positionSize) {
        const strategyState: StrategyState = {
          activePositions: activePositions.map((p) => ({
            id: BigInt(p.id),
            asset: p.asset,
            openPrice: p.openPrice,
            openAmount: p.openAmount,
            openTime: p.openTime,
          })),
          maxPositions: this.maxPositions,
          maxPerPosition: this.positionSize,
          maxTotalExposure: this.initialCapital,
        };

        const actions = this.getStrategyActions(history, strategyState);
        for (const action of actions) {
          if (action.type === 'open') {
            // Check not already in this asset
            if (!activePositions.find((p) => p.asset === action.asset)) {
              activePositions.push({
                id: ++tradeId,
                asset: action.asset,
                openBar: i,
                openPrice: action.asset === 'eth' ? bar.eth : bar.btc,
                openAmount: this.positionSize,
                openTime: bar.timestamp,
                reason: action.reason,
              });
            }
          }
        }
      }

      // Track equity
      let unrealizedPnl = 0;
      for (const pos of activePositions) {
        const cp = pos.asset === 'eth' ? bar.eth : bar.btc;
        const pnl = pos.openAmount * ((cp - pos.openPrice) / pos.openPrice) * 2;
        unrealizedPnl += pnl;
      }
      const equity = capital + unrealizedPnl;
      equityCurve.push({ bar: i, equity });

      if (equity > maxEquity) maxEquity = equity;
      const dd = (maxEquity - equity) / maxEquity * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Close any still-open positions at last price
    for (const pos of activePositions) {
      const lastBar = this.bars[this.bars.length - 1];
      const currentPrice = pos.asset === 'eth' ? lastBar.eth : lastBar.btc;
      const pnlPct = ((currentPrice - pos.openPrice) / pos.openPrice) * 100;
      const pnlUsdc = pos.openAmount * (pnlPct / 100) * 2;
      const daysHeld = (lastBar.timestamp - pos.openTime) / 86400000;

      trades.push({
        id: pos.id,
        asset: pos.asset,
        openBar: pos.openBar,
        closeBar: this.bars.length - 1,
        openPrice: pos.openPrice,
        closePrice: currentPrice,
        openTime: pos.openTime,
        closeTime: lastBar.timestamp,
        pnlPct,
        pnlUsdc,
        positionSize: pos.openAmount,
        reason: pos.reason,
        closeReason: 'Backtest end (still open)',
        daysHeld,
        wouldBeliquidated: pnlPct <= -8,
      } as BacktestTrade);
      capital += pnlUsdc;
    }

    // Compute stats
    const winning = trades.filter((t) => t.pnlUsdc > 0);
    const losing = trades.filter((t) => t.pnlUsdc <= 0);
    const winRate = trades.length > 0 ? winning.length / trades.length : 0;
    const totalPnlUsdc = capital - this.initialCapital;
    const totalPnlPct = (totalPnlUsdc / this.initialCapital) * 100;
    const avgWinPct = winning.length > 0 ? winning.reduce((s, t) => s + t.pnlPct, 0) / winning.length : 0;
    const avgLossPct = losing.length > 0 ? losing.reduce((s, t) => s + t.pnlPct, 0) / losing.length : 0;
    const avgHoldDays = trades.length > 0 ? trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length : 0;
    const liquidationsAvoided = trades.filter((t) => t.wouldBeliquidated).length;

    // Sharpe: annualized return / annualized std of daily returns
    let sharpeRatio = 0;
    if (equityCurve.length > 2) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < equityCurve.length; i++) {
        dailyReturns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity);
      }
      const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const stdReturn = Math.sqrt(
        dailyReturns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / dailyReturns.length
      );
      sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(365) : 0;
    }

    return {
      strategy: this.strategy,
      totalTrades: trades.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      winRate,
      totalPnlUsdc,
      totalPnlPct,
      maxDrawdown,
      sharpeRatio,
      avgHoldDays,
      avgWinPct,
      avgLossPct,
      liquidationsAvoided,
      startCapital: this.initialCapital,
      endCapital: capital,
      trades,
      equityCurve,
    };
  }

  private getStrategyActions(history: PriceHistory, state: StrategyState): TradeAction[] {
    switch (this.strategy) {
      case 'momentum':
        return evaluateStrategy(history, state);
      case 'mean-reversion':
        return evaluateMeanReversionStrategy(history, state);
      case 'combined': {
        // Run both, deduplicate
        const momentum = evaluateStrategy(history, state);
        const mr = evaluateMeanReversionStrategy(history, state);
        const combined = [...momentum, ...mr];
        // Deduplicate open signals by asset (prefer momentum for opens, MR for closes)
        const opens = new Map<string, TradeAction>();
        const others: TradeAction[] = [];
        for (const a of combined) {
          if (a.type === 'open') {
            if (!opens.has(a.asset)) opens.set(a.asset, a);
          } else {
            others.push(a);
          }
        }
        return [...opens.values(), ...others];
      }
    }
  }
}
