import { SignalSummary, computeSignals } from '../utils/indicators';
import { PriceHistory, getAssetPrices } from '../utils/prices';
import { logDecision } from '../utils/logger';

export type TradeAction =
  | { type: 'open'; asset: 'eth' | 'btc'; reason: string; confidence: number; strategy?: string }
  | { type: 'close'; asset: 'eth' | 'btc'; positionId: bigint; reason: string; strategy?: string }
  | { type: 'hold'; reason: string; strategy?: string };

export interface ActivePosition {
  id: bigint;
  asset: 'eth' | 'btc';
  openPrice: number;
  openAmount: number;
  openTime: number;
}

export interface StrategyState {
  activePositions: ActivePosition[];
  maxPositions: number;
  maxPerPosition: number;
  maxTotalExposure: number;
}

/**
 * Momentum Strategy:
 * - Open long on strong_buy / buy signals when RSI < 40 and MA crossover is bullish
 * - Close on sell signals, take profit at +15%, or stop loss at -10% (soft stop — no liquidation!)
 * - Position sizing: fixed % of available capital
 * - Asset rotation: pick the asset with strongest signal
 */
export function evaluateStrategy(
  history: PriceHistory,
  state: StrategyState
): TradeAction[] {
  const actions: TradeAction[] = [];
  const ethPrices = getAssetPrices(history, 'eth');
  const btcPrices = getAssetPrices(history, 'btc');

  if (ethPrices.length < 30 || btcPrices.length < 30) {
    return [{ type: 'hold', reason: 'Insufficient price history (need 30+ data points)' }];
  }

  const ethSignals = computeSignals(ethPrices, 'ETH');
  const btcSignals = computeSignals(btcPrices, 'BTC');

  // Check existing positions for close signals
  for (const pos of state.activePositions) {
    const signals = pos.asset === 'eth' ? ethSignals : btcSignals;
    const currentPrice = signals.price;
    const pnlPct = ((currentPrice - pos.openPrice) / pos.openPrice) * 100;

    // Take profit at +15%
    if (pnlPct >= 15) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `Take profit: ${pnlPct.toFixed(1)}% gain on ${pos.asset.toUpperCase()}`,
      });
      continue;
    }

    // Soft stop at -10% (no liquidation in 2xSwap, so we choose when to exit)
    if (pnlPct <= -10) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `Soft stop: ${pnlPct.toFixed(1)}% loss on ${pos.asset.toUpperCase()} — exiting to preserve capital`,
      });
      continue;
    }

    // Close on strong sell signal
    if (signals.overallSignal === 'strong_sell') {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `Strong sell signal on ${pos.asset.toUpperCase()} (RSI: ${signals.rsi?.toFixed(1)})`,
      });
      continue;
    }

    // Check if position is nearing expiry (30 days before)
    const daysOpen = (Date.now() - pos.openTime) / (1000 * 86400);
    if (daysOpen > 335) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `Position approaching 1-year expiry (${daysOpen.toFixed(0)} days open)`,
      });
    }
  }

  // Evaluate new positions
  const currentExposure = state.activePositions.reduce((sum, p) => sum + p.openAmount, 0);
  const canOpen = state.activePositions.length < state.maxPositions
    && currentExposure < state.maxTotalExposure;

  if (canOpen) {
    // Pick the stronger signal
    const candidates: { asset: 'eth' | 'btc'; signals: SignalSummary }[] = [];

    if (['strong_buy', 'buy'].includes(ethSignals.overallSignal)) {
      candidates.push({ asset: 'eth', signals: ethSignals });
    }
    if (['strong_buy', 'buy'].includes(btcSignals.overallSignal)) {
      candidates.push({ asset: 'btc', signals: btcSignals });
    }

    // Already have a position in this asset? Skip it.
    const existingAssets = new Set(state.activePositions.map((p) => p.asset));
    const filtered = candidates.filter((c) => !existingAssets.has(c.asset));

    if (filtered.length > 0) {
      // Sort by signal strength
      const sorted = filtered.sort((a, b) => {
        const strength = { strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2 };
        return strength[b.signals.overallSignal] - strength[a.signals.overallSignal];
      });

      const best = sorted[0];
      const confidence = best.signals.overallSignal === 'strong_buy' ? 0.8 : 0.6;

      actions.push({
        type: 'open',
        asset: best.asset,
        reason: `${best.signals.overallSignal.toUpperCase()} on ${best.asset.toUpperCase()} | `
          + `RSI: ${best.signals.rsi?.toFixed(1)} | `
          + `SMA7/25: ${best.signals.sma7?.toFixed(0)}/${best.signals.sma25?.toFixed(0)} | `
          + `Vol: ${best.signals.volatility?.toFixed(1)}%`,
        confidence,
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      type: 'hold',
      reason: `No action needed | ETH: ${ethSignals.overallSignal} (RSI ${ethSignals.rsi?.toFixed(1)}) | BTC: ${btcSignals.overallSignal} (RSI ${btcSignals.rsi?.toFixed(1)})`,
    });
  }

  for (const action of actions) {
    logDecision(action.type, action.reason);
  }

  return actions;
}
