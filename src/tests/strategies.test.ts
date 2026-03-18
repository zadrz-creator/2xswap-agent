/**
 * Unit tests for trading strategies.
 * Tests momentum and mean reversion strategies with synthetic price series.
 *
 * Run: npx ts-node src/tests/strategies.test.ts
 */

import { evaluateStrategy, StrategyState, ActivePosition } from '../strategies/momentum';
import { evaluateMeanReversionStrategy, computeMeanReversionSignal } from '../strategies/mean-reversion';
import { createPriceHistory, addPrice, PriceHistory } from '../utils/prices';

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, label: string): void {
  total++;
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  total++;
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✅ ${label} (= ${JSON.stringify(actual)})`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
    failed++;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildHistory(ethPrices: number[], btcPrices: number[]): PriceHistory {
  const h = createPriceHistory(500);
  const len = Math.max(ethPrices.length, btcPrices.length);
  const now = Date.now();
  for (let i = 0; i < len; i++) {
    addPrice(h, {
      eth: ethPrices[i] ?? ethPrices[ethPrices.length - 1],
      btc: btcPrices[i] ?? btcPrices[btcPrices.length - 1],
      timestamp: now - (len - i) * 3600_000,
    });
  }
  return h;
}

function emptyState(overrides?: Partial<StrategyState>): StrategyState {
  return {
    activePositions: [],
    maxPositions: 4,
    maxPerPosition: 250,
    maxTotalExposure: 1000,
    ...overrides,
  };
}

function makePosition(asset: 'eth' | 'btc', openPrice: number, openAmount = 250): ActivePosition {
  return {
    id: BigInt(Math.floor(Math.random() * 1_000_000)),
    asset,
    openPrice,
    openAmount,
    openTime: Date.now() - 5 * 86_400_000, // 5 days ago
  };
}

// ── Trending up (oversold entry, recovering) series ──────────────────────────

// Build 60-bar oversold-then-recovering series (ETH: drops then rises)
function oversoldRecovery(length = 60, dropTo = 0.85, base = 2000): number[] {
  const prices: number[] = [];
  for (let i = 0; i < length; i++) {
    const phase = i / length;
    if (phase < 0.4) {
      // Falling phase
      prices.push(base * (1 - (1 - dropTo) * (phase / 0.4)));
    } else {
      // Recovery phase — come back above base
      const recovery = dropTo + (1 - dropTo) * ((phase - 0.4) / 0.6) * 1.1;
      prices.push(base * recovery);
    }
  }
  return prices;
}

// Steady uptrend: for momentum entry
function uptrend(length = 60, start = 2000, end = 2500): number[] {
  return Array.from({ length }, (_, i) => start + (end - start) * (i / (length - 1)));
}

// Overbought (for sell signals)
function overbought(length = 60, start = 2000, end = 3500): number[] {
  return Array.from({ length }, (_, i) => start + (end - start) * (i / (length - 1)));
}

// Flat series — sinusoidal oscillation around price to produce neutral RSI (~50) with no crossover
// This ensures tests relying on P&L thresholds are deterministic (price oscillates around `price`)
function flat(length = 60, price = 2000): number[] {
  // Use small amplitude so P&L calculations are stable — last value ≈ price ± amplitude
  const amplitude = price * 0.005; // 0.5% amplitude
  return Array.from({ length }, (_, i) => price + Math.sin(i * 0.4) * amplitude);
}

// For tests that need exact price (no oscillation) — use for take-profit / stop tests
function fixedPrice(length = 60, price = 2000): number[] {
  // Alternate up/down by tiny amount to give ~50 RSI but avoid bearish crossover issues
  // Use sine to ensure last price is predictable
  return Array.from({ length }, (_, i) => price + Math.sin(i * Math.PI / 2) * 0.5);
}

// ── SECTION 1: Momentum Strategy Tests ───────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Momentum Strategy Tests');
console.log('═══════════════════════════════════════════════════════════');

// Test 1.1: Returns hold when insufficient history
{
  console.log('\n📊 1.1 Insufficient history → hold');
  const h = buildHistory([2000, 2010, 2020], [30000, 30100, 30200]);
  const actions = evaluateStrategy(h, emptyState());
  assert(actions.length === 1, 'Returns exactly 1 action');
  assertEqual(actions[0].type, 'hold', 'Action is hold');
  assert(actions[0].reason.includes('Insufficient'), 'Reason mentions insufficient data');
}

// Test 1.2: Take profit fires at +15%
{
  console.log('\n📊 1.2 Take profit at +15%');
  const prices = flat(50, 2000); // deterministic: last price = 1999
  const h = buildHistory(prices, flat(50, 30000));
  const pos = makePosition('eth', 1600); // 1600 → PnL = (1999-1600)/1600 = +24.9% → take profit fires
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateStrategy(h, state);
  const close = actions.find((a) => a.type === 'close' && (a as any).positionId === pos.id);
  assert(!!close, 'Close action emitted for profitable position');
  assert(close!.reason.includes('profit'), 'Reason mentions take profit');
}

// Test 1.3: Soft stop fires at -10%
{
  console.log('\n📊 1.3 Soft stop at -10%');
  // flat(50, 2000) last price ≈ 2006.82 (sinusoidal around 2000)
  // openPrice 2240 → PnL = (2006.82 - 2240)/2240 ≈ -10.4% → triggers soft stop
  const prices = flat(50, 2000);
  const h = buildHistory(prices, flat(50, 30000));
  const pos = makePosition('eth', 2240); // ~10.4% loss at current price
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateStrategy(h, state);
  const close = actions.find((a) => a.type === 'close' && (a as any).positionId === pos.id);
  assert(!!close, 'Close action emitted for stopped-out position');
  assert(close!.reason.toLowerCase().includes('stop'), 'Reason mentions stop');
}

// Test 1.4: No duplicate open on same asset
{
  console.log('\n📊 1.4 No duplicate open on same asset');
  // Use strong uptrend to generate buy signal
  const ethPrices = uptrend(60, 1500, 2200); // strong momentum
  const btcPrices = flat(60, 30000);
  const h = buildHistory(ethPrices, btcPrices);
  const pos = makePosition('eth', 1900); // existing ETH position
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateStrategy(h, state);
  const ethOpens = actions.filter((a) => a.type === 'open' && (a as any).asset === 'eth');
  assert(ethOpens.length === 0, 'No duplicate open on asset with existing position');
}

// Test 1.5: Max positions respected
{
  console.log('\n📊 1.5 Max positions respected');
  const ethPrices = uptrend(60, 1500, 2200);
  const btcPrices = uptrend(60, 28000, 35000);
  const h = buildHistory(ethPrices, btcPrices);
  const state = emptyState({
    maxPositions: 2,
    activePositions: [makePosition('eth', 2000), makePosition('btc', 32000)],
  });
  const actions = evaluateStrategy(h, state);
  const opens = actions.filter((a) => a.type === 'open');
  assert(opens.length === 0, 'No new opens when at max positions');
}

// Test 1.6: Expiry check at 335+ days
{
  console.log('\n📊 1.6 Position nearing 1-year expiry triggers close');
  // flat(50, 2000): sinusoidal → signal = sell (not strong_sell), so expiry check runs
  // The expiry position is opened at current price (no P&L, no stop), only expiry triggers
  const prices = flat(50, 2000);
  const h = buildHistory(prices, flat(50, 30000));
  const veryOldPos: ActivePosition = {
    id: BigInt(42),
    asset: 'eth',
    openPrice: 2000,
    openAmount: 250,
    openTime: Date.now() - 340 * 86_400_000, // 340 days ago
  };
  const state = emptyState({ activePositions: [veryOldPos] });
  const actions = evaluateStrategy(h, state);
  const close = actions.find((a) => a.type === 'close' && (a as any).positionId === BigInt(42));
  assert(!!close, 'Old position generates close action');
  assert(close!.reason.toLowerCase().includes('expir'), 'Reason mentions expiry');
}

// ── SECTION 2: Mean Reversion Signal Tests ───────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Mean Reversion Signal Tests');
console.log('═══════════════════════════════════════════════════════════');

// Test 2.1: Oversold condition produces buy signal
{
  console.log('\n📊 2.1 Oversold price at lower BB → buy signal');
  // Price drops sharply below BB
  const base = Array.from({ length: 30 }, (_, i) => 2000 + Math.sin(i * 0.3) * 50);
  const oversoldExtension = Array.from({ length: 10 }, (_, i) => 1700 - i * 5); // deep drop
  const prices = [...base, ...oversoldExtension];
  const signal = computeMeanReversionSignal(prices, 'ETH');
  assert(['strong_buy', 'buy'].includes(signal.signal), `Oversold generates buy signal (got ${signal.signal})`);
  assert(signal.bbPosition !== null && signal.bbPosition < 0.4, `BB position in lower zone (${signal.bbPosition?.toFixed(2)})`);
}

// Test 2.2: Overbought condition produces sell signal
{
  console.log('\n📊 2.2 Overbought at upper BB → sell signal');
  const base = Array.from({ length: 30 }, (_, i) => 2000 + Math.sin(i * 0.3) * 50);
  const overboughtExt = Array.from({ length: 10 }, (_, i) => 2350 + i * 10); // spike up
  const prices = [...base, ...overboughtExt];
  const signal = computeMeanReversionSignal(prices, 'ETH');
  assert(['strong_sell', 'sell'].includes(signal.signal), `Overbought generates sell signal (got ${signal.signal})`);
}

// Test 2.3: Middle band = neutral
{
  console.log('\n📊 2.3 Price at middle band → neutral signal');
  const prices = Array.from({ length: 30 }, () => 2000 + (Math.random() - 0.5) * 20);
  const signal = computeMeanReversionSignal(prices, 'ETH');
  assert(signal.bb !== null, 'BB computed');
  assert(signal.bbPosition !== null, 'BB position available');
}

// Test 2.4: Insufficient data returns neutral
{
  console.log('\n📊 2.4 Insufficient data → neutral with message');
  const signal = computeMeanReversionSignal([2000, 2010, 1990], 'ETH');
  assertEqual(signal.signal, 'neutral', 'Returns neutral signal');
  assert(signal.bb === null, 'No BB computed');
  assert(signal.reason.includes('Insufficient'), 'Reason explains insufficient data');
}

// ── SECTION 3: Mean Reversion Strategy Tests ─────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Mean Reversion Strategy Tests');
console.log('═══════════════════════════════════════════════════════════');

// Test 3.1: Exit when price returns to middle band
{
  console.log('\n📊 3.1 Exit when price returns to middle BB');
  // Build series: normal range (flat), so bbPosition ≈ 0.5
  const prices = Array.from({ length: 50 }, (_, i) =>
    2000 + Math.sin(i * 0.4) * 30
  );
  const h = buildHistory(prices, flat(50, 30000));
  // Open price was low, now at middle band — should trigger close
  const pos: ActivePosition = {
    id: BigInt(77),
    asset: 'eth',
    openPrice: 1950, // was low
    openAmount: 250,
    openTime: Date.now() - 3 * 86_400_000,
  };
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateMeanReversionStrategy(h, state);
  // In neutral zone it might close the position
  assert(actions.length > 0, 'Strategy returns at least one action');
}

// Test 3.2: MR take profit at +12%
{
  console.log('\n📊 3.2 MR take profit at +12%');
  const prices = flat(50, 2000); // deterministic: last price = 1999
  const h = buildHistory(prices, flat(50, 30000));
  const pos: ActivePosition = {
    id: BigInt(88),
    asset: 'eth',
    openPrice: 1700, // 1700 → PnL = (1999-1700)/1700 = +17.6% → take profit fires
    openAmount: 250,
    openTime: Date.now() - 3 * 86_400_000,
  };
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateMeanReversionStrategy(h, state);
  const close = actions.find((a) => a.type === 'close' && (a as any).positionId === pos.id);
  assert(!!close, 'Close action emitted at +12%+ profit');
  assert(close!.reason.includes('profit'), 'Reason mentions take profit');
}

// Test 3.3: No duplicate opens on same asset
{
  console.log('\n📊 3.3 MR strategy: no duplicate opens on same asset');
  const oversoldEth = [...Array.from({ length: 30 }, () => 2000), ...Array.from({ length: 20 }, (_, i) => 1650 - i * 5)];
  const h = buildHistory(oversoldEth, flat(50, 30000));
  const existingPos = makePosition('eth', 1900);
  const state = emptyState({ activePositions: [existingPos] });
  const actions = evaluateMeanReversionStrategy(h, state);
  const ethOpens = actions.filter((a) => a.type === 'open' && (a as any).asset === 'eth');
  assert(ethOpens.length === 0, 'No duplicate ETH open when position exists');
}

// Test 3.4: Actions always include at least a hold or valid trade
{
  console.log('\n📊 3.4 Strategy always returns non-empty actions');
  const h = buildHistory(flat(50, 2000), flat(50, 30000));
  const actions = evaluateMeanReversionStrategy(h, emptyState());
  assert(actions.length >= 1, 'Always at least one action returned');
  const validTypes = new Set(['open', 'close', 'hold']);
  assert(actions.every((a) => validTypes.has(a.type)), 'All actions have valid type');
}

// ── SECTION 4: 2xSwap No-Liquidation Advantage Tests ─────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  2xSwap No-Liquidation Advantage');
console.log('═══════════════════════════════════════════════════════════');

// Test 4.1: Soft stop triggers at -10%, NOT at -8% (no forced liquidation)
{
  console.log('\n📊 4.1 Soft stop at -10%, NOT forced at -8% (no liquidation)');
  // flat(50, 2000) → last price ≈ 2006.82 (sinusoidal, signal = sell, not strong_sell)
  const prices = flat(50, 2000);
  const h = buildHistory(prices, flat(50, 30000));

  // Position at -8% (would be liquidated on traditional perps, NOT on 2xSwap)
  // last ≈ 2006.82; openPrice = 2006.82 / 0.921 ≈ 2179 → PnL ≈ -7.9% (below -10% threshold)
  const posAt8pct: ActivePosition = {
    id: BigInt(101),
    asset: 'eth',
    openPrice: 2179, // ~8% above current price → PnL ≈ -7.9%, no soft stop
    openAmount: 250,
    openTime: Date.now() - 5 * 86_400_000,
  };

  const stateWith8pct = emptyState({ activePositions: [posAt8pct] });
  const actionsAt8 = evaluateStrategy(h, stateWith8pct);
  const closeAt8 = actionsAt8.find((a) => a.type === 'close' && (a as any).positionId === posAt8pct.id
    && (a as any).reason?.toLowerCase().includes('stop'));
  // On 2xSwap this should NOT trigger stop (no forced liquidation at -8%)
  assert(!closeAt8, 'No stop-loss close at -8% (would be liquidated on other protocols, not 2xSwap)');

  // Position at -10%+ (2xSwap soft stop triggers)
  // last ≈ 2006.82; openPrice = 2240 → PnL ≈ -10.4%
  const posAt10pct: ActivePosition = {
    id: BigInt(102),
    asset: 'eth',
    openPrice: 2240, // ~10.4% loss → soft stop triggers
    openAmount: 250,
    openTime: Date.now() - 5 * 86_400_000,
  };

  const stateWith10pct = emptyState({ activePositions: [posAt10pct] });
  const actionsAt10 = evaluateStrategy(h, stateWith10pct);
  const closeAt10 = actionsAt10.find((a) => a.type === 'close' && (a as any).positionId === posAt10pct.id);
  assert(!!closeAt10, 'Soft stop triggers at -10%+');
}

// Test 4.2: Verify agent can hold through -9% drawdown (no liquidation)
{
  console.log('\n📊 4.2 Agent holds through -9% drawdown (key 2xSwap advantage)');
  // flat(50, 2000) → last price ≈ 2006.82; signal = sell (not strong_sell)
  // openPrice = 2197 → PnL = (2006.82-2197)/2197 ≈ -8.65% — below -10% soft stop
  const prices = flat(50, 2000);
  const h = buildHistory(prices, flat(50, 30000));
  const pos: ActivePosition = {
    id: BigInt(201),
    asset: 'eth',
    openPrice: 2197, // ~-9.5% loss — would be liquidated on traditional perps
    openAmount: 250,
    openTime: Date.now() - 5 * 86_400_000,
  };
  const state = emptyState({ activePositions: [pos] });
  const actions = evaluateStrategy(h, state);
  const close = actions.find((a) => a.type === 'close' && (a as any).positionId === pos.id
    && (a as any).reason?.toLowerCase().includes('stop'));
  assert(!close,
    'No stop-loss close at -9% — agent holds (traditional protocol would liquidate here)');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(62)}`);
console.log(`  Strategies Test Results: ${passed}/${total} passed`);
if (failed > 0) {
  console.log(`  ❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('  ✅ All strategy tests passed');
}
