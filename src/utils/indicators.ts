/**
 * Technical indicators — pure functions, no dependencies.
 */

/** Simple Moving Average */
export function sma(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential Moving Average */
export function ema(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let value = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    value = data[i] * k + value * (1 - k);
  }
  return value;
}

/**
 * Relative Strength Index (0–100).
 * RSI > 70 → overbought, RSI < 30 → oversold.
 */
export function rsi(data: number[], period = 14): number | null {
  if (data.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  const recent = data.slice(-(period + 1));

  for (let i = 1; i <= period; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Annualized volatility from price array (returns %) */
export function volatility(data: number[], lookback = 20): number | null {
  if (data.length < lookback + 1) return null;
  const recent = data.slice(-(lookback + 1));
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push(Math.log(recent[i] / recent[i - 1]));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100; // annualized %
}

/**
 * MA Crossover signal.
 * Returns 'bullish' if short MA just crossed above long MA,
 * 'bearish' if short MA just crossed below, null otherwise.
 */
export function maCrossover(
  data: number[],
  shortPeriod = 7,
  longPeriod = 25
): 'bullish' | 'bearish' | null {
  if (data.length < longPeriod + 1) return null;

  const prev = data.slice(0, -1);
  const shortNow = sma(data, shortPeriod);
  const longNow = sma(data, longPeriod);
  const shortPrev = sma(prev, shortPeriod);
  const longPrev = sma(prev, longPeriod);

  if (!shortNow || !longNow || !shortPrev || !longPrev) return null;

  if (shortPrev <= longPrev && shortNow > longNow) return 'bullish';
  if (shortPrev >= longPrev && shortNow < longNow) return 'bearish';
  return null;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/**
 * Bollinger Bands
 * @param data Price array
 * @param period SMA period (default 20)
 * @param stdDev Standard deviation multiplier (default 2)
 */
export function bollingerBands(
  data: number[],
  period = 20,
  stdDev = 2
): BollingerBands | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, v) => a + (v - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + stdDev * sd;
  const lower = middle - stdDev * sd;
  return { upper, middle, lower, bandwidth: (upper - lower) / middle };
}

/**
 * VWAP approximation (using price only, no volume data).
 * Returns the average of typical prices over the lookback period.
 */
export function vwap(data: number[], lookback = 24): number | null {
  if (data.length < lookback) return null;
  const slice = data.slice(-lookback);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export interface SignalSummary {
  asset: string;
  price: number;
  rsi: number | null;
  sma7: number | null;
  sma25: number | null;
  volatility: number | null;
  maCrossover: 'bullish' | 'bearish' | null;
  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

/** Aggregate all signals into a single summary */
export function computeSignals(prices: number[], asset: string): SignalSummary {
  const current = prices[prices.length - 1];
  const rsiVal = rsi(prices);
  const sma7Val = sma(prices, 7);
  const sma25Val = sma(prices, 25);
  const volVal = volatility(prices);
  const crossover = maCrossover(prices);

  // Scoring: -2 to +2
  let score = 0;

  if (rsiVal !== null) {
    if (rsiVal < 30) score += 2;
    else if (rsiVal < 40) score += 1;
    else if (rsiVal > 70) score -= 2;
    else if (rsiVal > 60) score -= 1;
  }

  if (crossover === 'bullish') score += 2;
  if (crossover === 'bearish') score -= 2;

  if (sma7Val && sma25Val) {
    if (sma7Val > sma25Val) score += 1;
    else score -= 1;
  }

  // High volatility = caution
  if (volVal !== null && volVal > 100) score -= 1;

  let overallSignal: SignalSummary['overallSignal'];
  if (score >= 3) overallSignal = 'strong_buy';
  else if (score >= 1) overallSignal = 'buy';
  else if (score <= -3) overallSignal = 'strong_sell';
  else if (score <= -1) overallSignal = 'sell';
  else overallSignal = 'neutral';

  return {
    asset,
    price: current,
    rsi: rsiVal,
    sma7: sma7Val,
    sma25: sma25Val,
    volatility: volVal,
    maCrossover: crossover,
    overallSignal,
  };
}
