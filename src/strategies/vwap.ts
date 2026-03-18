/**
 * VWAP Strategy
 *
 * Volume-Weighted Average Price (VWAP) approximated via rolling average.
 * 
 * Logic:
 * - Enter LONG when: price is > 3% below VWAP + RSI < 40 (oversold + below value)
 * - Enter LONG when: price breaks back above VWAP after being below (reversal)
 * - Exit when: price > 2% above VWAP (overextended) or signal weakens
 * - Take profit at +12%, Soft stop at -10% (no liquidation on 2xSwap)
 *
 * Works best in trending markets to confirm mean-reversion entries.
 */

import { getAssetPrices, PriceHistory } from '../utils/prices';
import { vwap, rsi, bollingerBands } from '../utils/indicators';
import { logDecision } from '../utils/logger';
import { ActivePosition, StrategyState, TradeAction } from './momentum';

interface VWAPSignal {
  asset: 'eth' | 'btc';
  price: number;
  vwapValue: number;
  vwapDeviation: number; // % deviation from VWAP (negative = below)
  rsiValue: number | null;
  bbPosition: number | null; // 0 = lower band, 1 = upper band
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  reason: string;
}

function computeVWAPSignal(prices: number[], asset: string): VWAPSignal | null {
  if (prices.length < 26) return null;

  const price = prices[prices.length - 1];
  const vwapValue = vwap(prices, 24);
  const rsiValue = rsi(prices, 14);
  const bb = bollingerBands(prices, 20);

  if (!vwapValue) return null;

  const vwapDeviation = ((price - vwapValue) / vwapValue) * 100;
  const bbPosition = bb
    ? (price - bb.lower) / (bb.upper - bb.lower)
    : null;

  let signal: VWAPSignal['signal'] = 'neutral';
  let reason = '';

  // VWAP-based signals
  // Strong buy: price significantly below VWAP + RSI oversold
  if (vwapDeviation <= -3 && rsiValue !== null && rsiValue < 35) {
    signal = 'strong_buy';
    reason = `Price ${Math.abs(vwapDeviation).toFixed(1)}% below VWAP, RSI oversold (${rsiValue.toFixed(1)})`;
  }
  // Buy: price below VWAP + RSI moderately oversold
  else if (vwapDeviation <= -1.5 && rsiValue !== null && rsiValue < 45) {
    signal = 'buy';
    reason = `Price ${Math.abs(vwapDeviation).toFixed(1)}% below VWAP, RSI ${rsiValue.toFixed(1)}`;
  }
  // Buy: price crossing back above VWAP from below + BB not overbought
  else if (vwapDeviation >= 0 && vwapDeviation <= 1 && rsiValue !== null && rsiValue < 60 && (bbPosition === null || bbPosition < 0.7)) {
    signal = 'buy';
    reason = `Price reclaimed VWAP (${vwapDeviation.toFixed(2)}% above), RSI ${rsiValue.toFixed(1)}`;
  }
  // Sell: price significantly above VWAP (extended)
  else if (vwapDeviation >= 3 && rsiValue !== null && rsiValue > 60) {
    signal = 'sell';
    reason = `Price ${vwapDeviation.toFixed(1)}% above VWAP, RSI ${rsiValue.toFixed(1)} (overextended)`;
  }
  // Strong sell: very extended above VWAP + overbought
  else if (vwapDeviation >= 5 && rsiValue !== null && rsiValue > 70) {
    signal = 'strong_sell';
    reason = `Price ${vwapDeviation.toFixed(1)}% above VWAP, RSI overbought (${rsiValue.toFixed(1)})`;
  }
  else {
    signal = 'neutral';
    reason = `VWAP deviation: ${vwapDeviation.toFixed(2)}%, RSI: ${rsiValue?.toFixed(1) ?? 'n/a'}`;
  }

  return {
    asset: asset as 'eth' | 'btc',
    price,
    vwapValue,
    vwapDeviation,
    rsiValue: rsiValue,
    bbPosition,
    signal,
    reason,
  };
}

/**
 * Evaluate VWAP strategy for current market conditions.
 * Returns list of trade actions to execute.
 */
export function evaluateVWAPStrategy(
  history: PriceHistory,
  state: StrategyState
): TradeAction[] {
  const actions: TradeAction[] = [];

  const ethPrices = getAssetPrices(history, 'eth');
  const btcPrices = getAssetPrices(history, 'btc');

  if (ethPrices.length < 26 || btcPrices.length < 26) {
    return [{ type: 'hold', reason: '[VWAP] Insufficient price history (need 26+ bars)' }];
  }

  const ethSignal = computeVWAPSignal(ethPrices, 'eth');
  const btcSignal = computeVWAPSignal(btcPrices, 'btc');

  // --- Check existing positions for exit signals ---
  for (const pos of state.activePositions) {
    const signal = pos.asset === 'eth' ? ethSignal : btcSignal;
    if (!signal) continue;

    const pnlPct = ((signal.price - pos.openPrice) / pos.openPrice) * 100;

    // Take profit at +12%
    if (pnlPct >= 12) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[VWAP] Take profit: +${pnlPct.toFixed(1)}%`,
      });
      continue;
    }

    // Soft stop at -10%
    if (pnlPct <= -10) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[VWAP] Soft stop: ${pnlPct.toFixed(1)}%`,
      });
      continue;
    }

    // Exit when price significantly overextended above VWAP (mean reversion complete)
    if (signal.vwapDeviation >= 2.5 && pnlPct > 0) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[VWAP] Price returned above VWAP (${signal.vwapDeviation.toFixed(1)}% up) | PnL: ${pnlPct.toFixed(1)}%`,
      });
      continue;
    }

    // Exit on strong sell signal
    if (signal.signal === 'strong_sell') {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[VWAP] ${signal.reason}`,
      });
      continue;
    }

    // Approaching expiry
    const daysOpen = (Date.now() - pos.openTime) / (1000 * 86400);
    if (daysOpen > 335) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[VWAP] Approaching 1-year expiry (${daysOpen.toFixed(0)} days)`,
      });
    }
  }

  // --- Check for new entries ---
  const currentExposure = state.activePositions.reduce((sum, p) => sum + p.openAmount, 0);
  const canOpen =
    state.activePositions.length < state.maxPositions &&
    currentExposure < state.maxTotalExposure;

  if (canOpen) {
    const candidates: VWAPSignal[] = [];

    if (ethSignal && ['strong_buy', 'buy'].includes(ethSignal.signal)) {
      candidates.push(ethSignal);
    }
    if (btcSignal && ['strong_buy', 'buy'].includes(btcSignal.signal)) {
      candidates.push(btcSignal);
    }

    const existingAssets = new Set(state.activePositions.map((p) => p.asset));
    const filtered = candidates.filter((c) => !existingAssets.has(c.asset));

    // Sort by signal strength + VWAP deviation (more below VWAP = better entry)
    const sorted = filtered.sort((a, b) => {
      const strength = { strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2 };
      const strDiff = strength[b.signal] - strength[a.signal];
      if (strDiff !== 0) return strDiff;
      return a.vwapDeviation - b.vwapDeviation; // more negative = further below VWAP = better
    });

    if (sorted.length > 0) {
      const best = sorted[0];
      const confidence = best.signal === 'strong_buy' ? 0.75 : 0.55;

      actions.push({
        type: 'open',
        asset: best.asset,
        reason: `[VWAP] ${best.reason}`,
        confidence,
      });
    }
  }

  if (actions.length === 0) {
    const ethInfo = ethSignal
      ? `ETH: ${ethSignal.signal} (VWAP dev: ${ethSignal.vwapDeviation.toFixed(2)}%)`
      : 'ETH: no signal';
    const btcInfo = btcSignal
      ? `BTC: ${btcSignal.signal} (VWAP dev: ${btcSignal.vwapDeviation.toFixed(2)}%)`
      : 'BTC: no signal';

    actions.push({
      type: 'hold',
      reason: `[VWAP] No opportunity | ${ethInfo} | ${btcInfo}`,
    });
  }

  for (const action of actions) {
    logDecision(action.type, action.reason);
  }

  return actions;
}

/**
 * Get current VWAP data for display (dashboard, reporting).
 */
export function getVWAPData(prices: number[]): {
  vwapValue: number | null;
  vwapDeviation: number | null;
  bbPosition: number | null;
} {
  if (prices.length < 24) return { vwapValue: null, vwapDeviation: null, bbPosition: null };

  const price = prices[prices.length - 1];
  const vwapValue = vwap(prices, 24);
  const bb = bollingerBands(prices, 20);

  return {
    vwapValue,
    vwapDeviation: vwapValue ? ((price - vwapValue) / vwapValue) * 100 : null,
    bbPosition: bb ? (price - bb.lower) / (bb.upper - bb.lower) : null,
  };
}
