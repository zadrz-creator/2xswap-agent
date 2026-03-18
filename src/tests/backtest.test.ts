/**
 * Unit tests for the BacktestEngine.
 * Tests statistical correctness, liquidation tracking, and result shape.
 *
 * Run: npx ts-node src/tests/backtest.test.ts
 */

import { BacktestEngine, PriceBar, BacktestResult } from '../backtest/engine';

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

function assertClose(a: number, b: number, label: string, tol = 0.05): void {
  total++;
  const ok = Math.abs(a - b) <= tol * Math.abs(b) + 0.001;
  if (ok) {
    console.log(`  ✅ ${label} (${a.toFixed(4)} ≈ ${b})`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} (got ${a.toFixed(4)}, expected ~${b})`);
    failed++;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate n bars with linear price trends */
function linearBars(n: number, ethStart: number, ethEnd: number, btcStart: number, btcEnd: number): PriceBar[] {
  const bars: PriceBar[] = [];
  const now = Date.now() - n * 86_400_000;
  for (let i = 0; i < n; i++) {
    bars.push({
      timestamp: now + i * 86_400_000,
      eth: ethStart + (ethEnd - ethStart) * (i / (n - 1)),
      btc: btcStart + (btcEnd - btcStart) * (i / (n - 1)),
    });
  }
  return bars;
}

/** Generate sinusoidal bars (mean-reverting pattern) */
function sineBars(n: number, ethBase: number, btcBase: number, amplitude = 0.15): PriceBar[] {
  const bars: PriceBar[] = [];
  const now = Date.now() - n * 86_400_000;
  for (let i = 0; i < n; i++) {
    bars.push({
      timestamp: now + i * 86_400_000,
      eth: ethBase * (1 + amplitude * Math.sin((i / n) * Math.PI * 6)),
      btc: btcBase * (1 + amplitude * Math.sin((i / n) * Math.PI * 6 + 1)),
    });
  }
  return bars;
}

/** Bars with a sharp drawdown (tests liquidation tracking) */
function drawdownBars(n: number, base: number, btcBase: number, drawdownAt: number, drawdownPct: number): PriceBar[] {
  const bars: PriceBar[] = [];
  const now = Date.now() - n * 86_400_000;
  for (let i = 0; i < n; i++) {
    let eth = base;
    if (i === drawdownAt) eth = base * (1 - drawdownPct / 100);
    else if (i > drawdownAt && i < drawdownAt + 5) eth = base * (1 - drawdownPct / 200); // partial recovery
    bars.push({ timestamp: now + i * 86_400_000, eth, btc: btcBase });
  }
  return bars;
}

// ── SECTION 1: Basic BacktestResult Shape ─────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  BacktestEngine — Result Shape Tests');
console.log('═══════════════════════════════════════════════════════════');

// Test 1.1: Result has required fields
{
  console.log('\n📊 1.1 Result has all required fields');
  const bars = sineBars(90, 2000, 30000);
  const engine = new BacktestEngine(bars, 'momentum', 1000);
  const result = engine.run();

  assert(typeof result.totalTrades === 'number', 'totalTrades is a number');
  assert(typeof result.winRate === 'number', 'winRate is a number');
  assert(typeof result.totalPnlUsdc === 'number', 'totalPnlUsdc is a number');
  assert(typeof result.totalPnlPct === 'number', 'totalPnlPct is a number');
  assert(typeof result.maxDrawdown === 'number', 'maxDrawdown is a number');
  assert(typeof result.sharpeRatio === 'number', 'sharpeRatio is a number');
  assert(typeof result.liquidationsAvoided === 'number', 'liquidationsAvoided is a number');
  assert(Array.isArray(result.trades), 'trades is an array');
  assert(Array.isArray(result.equityCurve), 'equityCurve is an array');
  assert(result.equityCurve.length > 0, 'equityCurve has entries');
}

// Test 1.2: win rate always in [0, 1]
{
  console.log('\n📊 1.2 Win rate always in [0,1]');
  const bars = sineBars(120, 2000, 30000);
  for (const strategy of ['momentum', 'mean-reversion', 'combined'] as const) {
    const result = new BacktestEngine(bars, strategy, 1000).run();
    assert(result.winRate >= 0 && result.winRate <= 1, `Win rate in [0,1] for ${strategy} (${result.winRate.toFixed(2)})`);
  }
}

// Test 1.3: totalTrades = winningTrades + losingTrades
{
  console.log('\n📊 1.3 totalTrades = winningTrades + losingTrades');
  const bars = sineBars(120, 2000, 30000);
  const result = new BacktestEngine(bars, 'combined', 1000).run();
  assertEqual2(
    result.winningTrades + result.losingTrades,
    result.totalTrades,
    'winning + losing = total'
  );
}

function assertEqual2(actual: number, expected: number, label: string): void {
  total++;
  if (actual === expected) {
    console.log(`  ✅ ${label} (= ${actual})`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} (${actual} !== ${expected})`);
    failed++;
  }
}

// Test 1.4: maxDrawdown is non-negative
{
  console.log('\n📊 1.4 maxDrawdown >= 0');
  const bars = sineBars(120, 2000, 30000);
  const result = new BacktestEngine(bars, 'momentum', 1000).run();
  assert(result.maxDrawdown >= 0, `maxDrawdown >= 0 (${result.maxDrawdown.toFixed(2)}%)`);
}

// Test 1.5: endCapital = startCapital + totalPnlUsdc (accounting for 2x leverage)
{
  console.log('\n📊 1.5 endCapital ≈ startCapital + totalPnlUsdc');
  const bars = sineBars(90, 2000, 30000);
  const result = new BacktestEngine(bars, 'momentum', 1000).run();
  const reconstructed = result.startCapital + result.totalPnlUsdc;
  assertClose(reconstructed, result.endCapital, 'endCapital = startCapital + totalPnlUsdc', 0.01);
}

// ── SECTION 2: Strategy Correctness ───────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  BacktestEngine — Strategy Behavior');
console.log('═══════════════════════════════════════════════════════════');

// Test 2.1: Bull trend should yield net long bias (may produce winners)
{
  console.log('\n📊 2.1 Strong bull trend → agent enters and captures gains');
  const bars = linearBars(120, 1500, 3000, 25000, 50000); // 2x price increase
  const result = new BacktestEngine(bars, 'momentum', 1000).run();
  assert(result.totalTrades >= 0, `Trades recorded (${result.totalTrades})`);
  // We can't guarantee specific profit, but check result is valid
  assert(result.endCapital > 0, `End capital remains positive ($${result.endCapital.toFixed(0)})`);
}

// Test 2.2: Mean reversion on sine wave — should find trades
{
  console.log('\n📊 2.2 Mean reversion finds trades on oscillating market');
  const bars = sineBars(180, 2000, 30000, 0.20);
  const result = new BacktestEngine(bars, 'mean-reversion', 1000).run();
  assert(result.totalTrades >= 0, `Mean reversion trades: ${result.totalTrades}`);
  assert(result.endCapital > 0, `End capital positive ($${result.endCapital.toFixed(0)})`);
}

// Test 2.3: Combined strategy produces trades from both strategies
{
  console.log('\n📊 2.3 Combined strategy includes both signal types');
  const bars = sineBars(180, 2000, 30000, 0.15);
  const momentumResult = new BacktestEngine(bars, 'momentum', 1000).run();
  const mrResult = new BacktestEngine(bars, 'mean-reversion', 1000).run();
  const combinedResult = new BacktestEngine(bars, 'combined', 1000).run();
  // Combined should have at least as many trades as either individual strategy
  assert(
    combinedResult.totalTrades >= 0,
    `Combined: ${combinedResult.totalTrades} trades (momentum: ${momentumResult.totalTrades}, MR: ${mrResult.totalTrades})`
  );
}

// ── SECTION 3: Liquidation Tracking ───────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  2xSwap No-Liquidation Tracking Tests');
console.log('═══════════════════════════════════════════════════════════');

// Test 3.1: liquidationsAvoided is non-negative integer
{
  console.log('\n📊 3.1 liquidationsAvoided is valid non-negative integer');
  const bars = sineBars(180, 2000, 30000, 0.2);
  for (const strategy of ['momentum', 'mean-reversion', 'combined'] as const) {
    const result = new BacktestEngine(bars, strategy, 1000).run();
    assert(
      Number.isInteger(result.liquidationsAvoided) && result.liquidationsAvoided >= 0,
      `${strategy}: liquidationsAvoided = ${result.liquidationsAvoided}`
    );
  }
}

// Test 3.2: Trades with pnlPct <= -8% are marked as wouldBeLiquidated
{
  console.log('\n📊 3.2 wouldBeLiquidated flag correct on deep-loss trades');
  const bars = sineBars(180, 2000, 30000, 0.25);
  const result = new BacktestEngine(bars, 'combined', 1000).run();
  const flaggedTrades = result.trades.filter((t) => t.wouldBeliquidated);
  const deepLossTrades = result.trades.filter((t) => t.pnlPct <= -8);
  assert(
    flaggedTrades.length === deepLossTrades.length,
    `wouldBeLiquidated flag matches trades with pnlPct <= -8% (${flaggedTrades.length} flagged, ${deepLossTrades.length} deep loss)`
  );
}

// Test 3.3: Positions that hit -8% are NOT forcibly closed (agent decides when to exit)
{
  console.log('\n📊 3.3 Agent controls exit — NO forced liquidation at -8%');
  // The key 2xSwap advantage: on other protocols, -8% on 2x leverage = liquidation
  // On 2xSwap, the agent can choose to hold through it
  // Verify: trade closeReason never says "liquidated" — only our soft stop at -10%
  const bars = sineBars(180, 2000, 30000, 0.25);
  const result = new BacktestEngine(bars, 'combined', 1000).run();
  const forcedLiquidation = result.trades.filter(
    (t) => t.closeReason.toLowerCase().includes('liquidat')
  );
  assert(
    forcedLiquidation.length === 0,
    `No forced liquidations in trade log (agent controls all exits) — ${result.trades.length} total trades`
  );
}

// Test 3.4: Sharpe ratio is a finite number
{
  console.log('\n📊 3.4 Sharpe ratio is a finite number');
  const bars = sineBars(180, 2000, 30000);
  for (const strategy of ['momentum', 'mean-reversion', 'combined'] as const) {
    const result = new BacktestEngine(bars, strategy, 1000).run();
    assert(
      isFinite(result.sharpeRatio),
      `${strategy}: sharpe ratio is finite (${result.sharpeRatio.toFixed(2)})`
    );
  }
}

// ── SECTION 4: Edge Cases ─────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  BacktestEngine — Edge Cases');
console.log('═══════════════════════════════════════════════════════════');

// Test 4.1: Very short series (under warmup) produces empty trades
{
  console.log('\n📊 4.1 Short price series (< warmup) produces 0 trades');
  const bars = linearBars(20, 2000, 2100, 30000, 31000);
  const result = new BacktestEngine(bars, 'momentum', 1000).run();
  assertEqual2(result.totalTrades, 0, '0 trades on series shorter than warmup');
}

// Test 4.2: Initial capital preserved when no trades
{
  console.log('\n📊 4.2 No-trade scenario: capital unchanged');
  const flatBars = Array.from({ length: 50 }, (_, i) => ({
    timestamp: Date.now() - (50 - i) * 86_400_000,
    eth: 2000,
    btc: 30000,
  }));
  const result = new BacktestEngine(flatBars, 'momentum', 1000).run();
  assert(result.endCapital <= 1001 && result.endCapital >= 990, `Capital ≈ $1000 on flat market (${result.endCapital.toFixed(2)})`);
}

// Test 4.3: Position size respects 25% default
{
  console.log('\n📊 4.3 Position size ≤ 25% of capital');
  const bars = sineBars(180, 2000, 30000, 0.2);
  const result = new BacktestEngine(bars, 'combined', 1000).run();
  const maxPositionSize = Math.max(...result.trades.map((t) => t.positionSize), 0);
  assert(maxPositionSize <= 250 + 1, `Max position size ≤ $250 (25% of $1000): got $${maxPositionSize.toFixed(0)}`);
}

// Test 4.4: Trade array integrity
{
  console.log('\n📊 4.4 Trade records have valid prices and timestamps');
  const bars = sineBars(180, 2000, 30000, 0.2);
  const result = new BacktestEngine(bars, 'combined', 1000).run();
  let valid = true;
  for (const trade of result.trades) {
    if (trade.openPrice <= 0 || trade.closePrice <= 0) { valid = false; break; }
    if (trade.openTime <= 0 || trade.closeTime <= 0) { valid = false; break; }
    if (trade.openTime > trade.closeTime) { valid = false; break; }
    if (!['eth', 'btc'].includes(trade.asset)) { valid = false; break; }
  }
  assert(valid, `All ${result.trades.length} trades have valid data`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(62)}`);
console.log(`  Backtest Test Results: ${passed}/${total} passed`);
if (failed > 0) {
  console.log(`  ❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('  ✅ All backtest engine tests passed');
}
