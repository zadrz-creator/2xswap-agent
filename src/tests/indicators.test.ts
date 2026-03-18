/**
 * Unit tests for technical indicators.
 * Run: npx ts-node src/tests/indicators.test.ts
 */

import { sma, ema, rsi, bollingerBands, vwap, maCrossover, volatility } from '../utils/indicators';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertClose(a: number | null, b: number, label: string, tolerance = 0.01): void {
  if (a === null) {
    console.log(`  ❌ FAIL (null): ${label}`);
    failed++;
    return;
  }
  const ok = Math.abs(a - b) / Math.max(Math.abs(b), 1) < tolerance;
  if (ok) {
    console.log(`  ✅ ${label} (${a.toFixed(4)} ≈ ${b})`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} (got ${a.toFixed(4)}, expected ~${b})`);
    failed++;
  }
}

// ── SMA ─────────────────────────────────────────────────────────

console.log('\n📊 SMA Tests');

assert(sma([1, 2, 3, 4, 5], 3) === 4, 'SMA(3) of [1,2,3,4,5] = 4');
assertClose(sma([10, 20, 30], 3), 20, 'SMA(3) of [10,20,30] = 20');
assert(sma([1, 2], 5) === null, 'SMA returns null when insufficient data');
assertClose(sma([100, 200, 300, 400, 500], 5), 300, 'SMA(5) of simple series');

// ── EMA ─────────────────────────────────────────────────────────

console.log('\n📊 EMA Tests');

const emaResult = ema([10, 10, 10, 10, 20], 3);
assert(emaResult !== null, 'EMA returns a value');
assert(emaResult !== null && emaResult > 10, 'EMA responds to price increase');
assert(ema([1], 5) === null, 'EMA returns null when insufficient data');

// ── RSI ─────────────────────────────────────────────────────────

console.log('\n📊 RSI Tests');

// All-up series should have RSI = 100
const allUp = Array.from({ length: 20 }, (_, i) => 100 + i);
assertClose(rsi(allUp), 100, 'RSI on constant uptrend = 100', 0.1);

// All-down series should have RSI near 0
const allDown = Array.from({ length: 20 }, (_, i) => 100 - i);
assertClose(rsi(allDown), 0, 'RSI on constant downtrend = 0', 0.1);

// Mixed series should be between 0 and 100
const mixed = [100, 102, 101, 103, 102, 105, 103, 104, 106, 105, 107, 106, 108, 107, 110];
const rsiMixed = rsi(mixed);
assert(rsiMixed !== null && rsiMixed > 0 && rsiMixed < 100, 'RSI on mixed series is between 0-100');
assert(rsiMixed !== null && rsiMixed > 50, 'RSI > 50 on upward-biased series');

assert(rsi([1, 2, 3]) === null, 'RSI returns null when insufficient data');

// ── Bollinger Bands ──────────────────────────────────────────────

console.log('\n📊 Bollinger Bands Tests');

const prices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
const bb = bollingerBands(prices, 20, 2);

assert(bb !== null, 'BB returns result with sufficient data');
assert(bb !== null && bb.upper > bb.middle, 'BB upper > middle');
assert(bb !== null && bb.lower < bb.middle, 'BB lower < middle');
assert(bb !== null && bb.upper > bb.lower, 'BB upper > lower');

// Current price should be near middle
const lastPrice = prices[prices.length - 1];
assert(bb !== null && lastPrice >= bb.lower && lastPrice <= bb.upper, 'Current price within bands');

assert(bollingerBands([1, 2, 3], 20) === null, 'BB returns null when insufficient data');

// ── VWAP ────────────────────────────────────────────────────────

console.log('\n📊 VWAP Tests');

const flatPrices = Array.from({ length: 30 }, () => 100);
assertClose(vwap(flatPrices, 24), 100, 'VWAP of flat price series = price');

const rampPrices = Array.from({ length: 30 }, (_, i) => 90 + i);
const vwapResult = vwap(rampPrices, 24);
assert(vwapResult !== null, 'VWAP returns value');
assert(vwapResult !== null && vwapResult > 90 && vwapResult < 120, 'VWAP within price range');

assert(vwap([1, 2, 3], 30) === null, 'VWAP returns null when insufficient data');

// ── MA Crossover ─────────────────────────────────────────────────

console.log('\n📊 MA Crossover Tests');

// Build series where short MA JUST crossed above long MA at the final bar.
// Strategy: 25 flat bars at 100, then 1 final bar at 500 (big spike).
// - prev (25 bars): short MA = 100, long MA = 100 → no crossover yet
// - now (26 bars): short MA = avg(100×6, 500)/7 ≈ 157, long MA = (100×24+500)/25 = 116
// → shortNow > longNow AND shortPrev ≤ longPrev → bullish crossover ✓
const crossoverSeries: number[] = [
  ...Array.from({ length: 25 }, () => 100), // 25 flat bars
  500, // spike at the very last bar → crossover happens NOW
];
const xover = maCrossover(crossoverSeries, 7, 25);
assert(xover === 'bullish', 'Bullish crossover detected on sharp rise');

// Flat series = no crossover
const flatSeries = Array.from({ length: 30 }, () => 100);
assert(maCrossover(flatSeries, 7, 25) === null, 'No crossover on flat series');

// ── Summary ──────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('❌ Some tests failed');
  process.exit(1);
} else {
  console.log('✅ All tests passed');
}
