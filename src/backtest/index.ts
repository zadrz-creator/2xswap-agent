#!/usr/bin/env node
/**
 * Backtest CLI
 * Usage: ts-node src/backtest/index.ts [--days 180] [--strategy all|momentum|mean-reversion|combined] [--synthetic]
 */

import { BacktestEngine, StrategyName } from './engine';
import { loadHistoricalBars, generateSyntheticBars } from './historical';
import { renderBacktestReport } from './report';

async function main() {
  const args = process.argv.slice(2);

  const days = parseInt(args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? '180', 10);
  const stratArg = args.find((a) => a.startsWith('--strategy='))?.split('=')[1] ?? 'all';
  const useSynthetic = args.includes('--synthetic');
  const capital = parseFloat(args.find((a) => a.startsWith('--capital='))?.split('=')[1] ?? '1000');

  console.log('\n2xSwap Agent Backtester');
  console.log('─────────────────────────────────────');
  console.log(`Days: ${days} | Strategy: ${stratArg} | Capital: $${capital} | Data: ${useSynthetic ? 'synthetic' : 'CoinGecko historical'}`);
  console.log();

  // Load price data
  let bars;
  if (useSynthetic) {
    bars = generateSyntheticBars(days);
    console.log(`Using synthetic data (${bars.length} bars)`);
  } else {
    try {
      bars = await loadHistoricalBars(days);
    } catch (err) {
      console.warn(`CoinGecko fetch failed: ${(err as Error).message}`);
      console.warn('Falling back to synthetic data...\n');
      bars = generateSyntheticBars(days);
    }
  }

  if (bars.length < 30) {
    console.error('Need at least 30 bars to backtest. Got:', bars.length);
    process.exit(1);
  }

  // Run strategies
  const strategies: StrategyName[] = stratArg === 'all'
    ? ['momentum', 'mean-reversion', 'combined']
    : [stratArg as StrategyName];

  const results = [];
  for (const strategy of strategies) {
    console.log(`Running ${strategy} strategy...`);
    const engine = new BacktestEngine(bars, strategy, capital, 0.25, 4);
    const result = engine.run();
    results.push(result);
    console.log(`  → ${result.totalTrades} trades | Win rate: ${(result.winRate * 100).toFixed(1)}% | PnL: ${result.totalPnlPct >= 0 ? '+' : ''}${result.totalPnlPct.toFixed(1)}%`);
  }

  // Render report
  renderBacktestReport(results);
}

main().catch((err) => {
  console.error('Backtest error:', err.message);
  process.exit(1);
});
