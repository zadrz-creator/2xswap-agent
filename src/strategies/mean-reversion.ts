/**
 * Mean Reversion Strategy
 *
 * Core thesis: DeFi tokens oscillate around moving averages.
 * Without liquidation risk (thanks to 2xSwap), we can hold positions longer
 * through temporary adverse moves — making mean reversion highly effective.
 *
 * Signals:
 * - Enter LONG when price touches lower Bollinger Band + RSI < 35 (oversold)
 * - Exit when price returns to middle band (SMA) or upper band
 * - Use VWAP deviation to confirm entries
 */

import { SignalSummary, computeSignals, bollingerBands, BollingerBands } from '../utils/indicators';
import { PriceHistory, getAssetPrices } from '../utils/prices';
import { logDecision } from '../utils/logger';
import { ActivePosition, StrategyState, TradeAction } from './momentum';

export interface MeanReversionSignal {
  asset: string;
  price: number;
  bb: BollingerBands | null;
  rsi: number | null;
  /** Deviation from middle band as % */
  bbDeviation: number | null;
  /** Where is price in the band: -1 (lower) to +1 (upper) */
  bbPosition: number | null;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  reason: string;
}

export function computeMeanReversionSignal(
  prices: number[],
  asset: string
): MeanReversionSignal {
  const price = prices[prices.length - 1];
  const bb = bollingerBands(prices, 20, 2);
  const baseSignals = computeSignals(prices, asset);
  const rsi = baseSignals.rsi;

  if (!bb) {
    return {
      asset,
      price,
      bb: null,
      rsi,
      bbDeviation: null,
      bbPosition: null,
      signal: 'neutral',
      reason: 'Insufficient data for Bollinger Bands (need 20+ candles)',
    };
  }

  // Position in band: 0 = lower band, 0.5 = middle, 1 = upper band
  const bandWidth = bb.upper - bb.lower;
  const bbPosition = bandWidth > 0 ? (price - bb.lower) / bandWidth : 0.5;
  const bbDeviation = ((price - bb.middle) / bb.middle) * 100;

  let score = 0;
  const reasons: string[] = [];

  // Bollinger Band signals
  if (bbPosition <= 0.1) {
    score += 3;
    reasons.push(`price at lower BB (${bbPosition.toFixed(2)})`);
  } else if (bbPosition <= 0.25) {
    score += 2;
    reasons.push(`price near lower BB (${bbPosition.toFixed(2)})`);
  } else if (bbPosition >= 0.9) {
    score -= 3;
    reasons.push(`price at upper BB (${bbPosition.toFixed(2)})`);
  } else if (bbPosition >= 0.75) {
    score -= 2;
    reasons.push(`price near upper BB (${bbPosition.toFixed(2)})`);
  }

  // RSI confirmation
  if (rsi !== null) {
    if (rsi < 30) {
      score += 2;
      reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi < 40) {
      score += 1;
      reasons.push(`RSI below 40 (${rsi.toFixed(1)})`);
    } else if (rsi > 70) {
      score -= 2;
      reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    } else if (rsi > 60) {
      score -= 1;
      reasons.push(`RSI above 60 (${rsi.toFixed(1)})`);
    }
  }

  // BB squeeze (narrow band = low vol, breakout coming)
  const bbWidth = bandWidth / bb.middle;
  if (bbWidth < 0.03) {
    reasons.push('BB squeeze (low volatility — breakout expected)');
  }

  let signal: MeanReversionSignal['signal'];
  if (score >= 4) signal = 'strong_buy';
  else if (score >= 2) signal = 'buy';
  else if (score <= -4) signal = 'strong_sell';
  else if (score <= -2) signal = 'sell';
  else signal = 'neutral';

  return {
    asset,
    price,
    bb,
    rsi,
    bbDeviation,
    bbPosition,
    signal,
    reason: reasons.join(', ') || 'No strong mean reversion signal',
  };
}

/**
 * Mean Reversion Strategy Evaluator
 *
 * Complements the momentum strategy by catching oversold bounces.
 * Unlike momentum, we WANT high RSI at close time (returned to mean).
 */
export function evaluateMeanReversionStrategy(
  history: PriceHistory,
  state: StrategyState
): TradeAction[] {
  const actions: TradeAction[] = [];
  const ethPrices = getAssetPrices(history, 'eth');
  const btcPrices = getAssetPrices(history, 'btc');

  if (ethPrices.length < 20 || btcPrices.length < 20) {
    return [{ type: 'hold', reason: '[MR] Insufficient data (need 20+ candles)' }];
  }

  const ethMR = computeMeanReversionSignal(ethPrices, 'ETH');
  const btcMR = computeMeanReversionSignal(btcPrices, 'BTC');

  // Check exit conditions on existing positions
  for (const pos of state.activePositions) {
    const mr = pos.asset === 'eth' ? ethMR : btcMR;
    const pnlPct = pos.openPrice > 0
      ? ((mr.price - pos.openPrice) / pos.openPrice) * 100
      : 0;

    // Exit: price returned to middle band = mean reversion complete
    if (mr.bb && mr.bbPosition !== null && mr.bbPosition >= 0.45 && mr.bbPosition <= 0.55) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[MR] Price returned to middle BB | PnL: ${pnlPct.toFixed(1)}% | BB pos: ${mr.bbPosition.toFixed(2)}`,
      });
      continue;
    }

    // Take profit at +12% (faster exit than momentum strategy)
    if (pnlPct >= 12) {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[MR] Take profit: ${pnlPct.toFixed(1)}% gain`,
      });
      continue;
    }

    // Exit if signal flips to overbought (upper band reached)
    if (mr.signal === 'strong_sell') {
      actions.push({
        type: 'close',
        asset: pos.asset,
        positionId: pos.id,
        reason: `[MR] Price at upper BB — mean reversion overshoot | PnL: ${pnlPct.toFixed(1)}%`,
      });
    }
  }

  // Evaluate new entry
  const currentExposure = state.activePositions.reduce((s, p) => s + p.openAmount, 0);
  const canOpen = state.activePositions.length < state.maxPositions
    && currentExposure < state.maxTotalExposure;

  if (canOpen) {
    const candidates: { asset: 'eth' | 'btc'; mr: MeanReversionSignal }[] = [];

    if (['strong_buy', 'buy'].includes(ethMR.signal)) {
      candidates.push({ asset: 'eth', mr: ethMR });
    }
    if (['strong_buy', 'buy'].includes(btcMR.signal)) {
      candidates.push({ asset: 'btc', mr: btcMR });
    }

    const existingAssets = new Set(state.activePositions.map((p) => p.asset));
    const filtered = candidates.filter((c) => !existingAssets.has(c.asset));

    if (filtered.length > 0) {
      const best = filtered.sort((a, b) => {
        const strength = { strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2 };
        return strength[b.mr.signal] - strength[a.mr.signal];
      })[0];

      const confidence = best.mr.signal === 'strong_buy' ? 0.75 : 0.55;

      actions.push({
        type: 'open',
        asset: best.asset,
        reason: `[MR] ${best.mr.signal.toUpperCase()} | ${best.mr.reason} | BB pos: ${best.mr.bbPosition?.toFixed(2)}`,
        confidence,
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      type: 'hold',
      reason: `[MR] No mean reversion opportunity | ETH: ${ethMR.signal} (BB pos: ${ethMR.bbPosition?.toFixed(2)}) | BTC: ${btcMR.signal} (BB pos: ${btcMR.bbPosition?.toFixed(2)})`,
    });
  }

  for (const action of actions) {
    logDecision(action.type, action.reason);
  }

  return actions;
}
