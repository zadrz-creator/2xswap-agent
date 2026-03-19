/**
 * Backtest Report Renderer
 * Outputs a rich CLI report of backtesting results.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { BacktestResult } from './engine';

// ── ASCII Equity Curve ────────────────────────────────────────────────────────

/**
 * Renders a multi-strategy equity curve chart side-by-side.
 * All curves normalized to starting capital = 100.
 * Height: 12 rows, Width: 80 chars wide.
 */
export function renderEquityCurve(results: BacktestResult[], width = 72, height = 12): void {
  if (results.length === 0 || results[0].equityCurve.length < 2) return;

  // Normalize all equity curves to start at 100
  const normalized = results.map((r) => {
    const curve = r.equityCurve;
    const start = curve[0]?.equity ?? r.startCapital;
    return curve.map((pt) => (pt.equity / start) * 100);
  });

  // Downsample all curves to `width` data points
  const sampled = normalized.map((curve) => {
    const result: number[] = [];
    for (let i = 0; i < width; i++) {
      const idx = Math.floor((i / width) * curve.length);
      result.push(curve[Math.min(idx, curve.length - 1)]);
    }
    return result;
  });

  // Find Y range across all curves
  const allValues = sampled.flat();
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const range = maxY - minY || 1;

  // Strategy color/symbol config (no chalk — using chars)
  const SYMBOLS = ['▲', '●', '◆', '✦'];
  const COLORS = [chalk.green, chalk.cyan, chalk.yellow, chalk.magenta];
  const NAMES = results.map((r) => r.strategy.toUpperCase());

  // Build the grid
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));

  // Plot each strategy
  for (let s = 0; s < sampled.length; s++) {
    for (let x = 0; x < width; x++) {
      const val = sampled[s][x];
      const row = Math.round(((maxY - val) / range) * (height - 1));
      const clampedRow = Math.max(0, Math.min(height - 1, row));

      // Only draw if the cell is empty or same strategy (avoid overdraw)
      const cell = grid[clampedRow][x];
      if (cell === ' ' || cell === '·') {
        grid[clampedRow][x] = `\x00${s}`;  // encode strategy index
      }
    }
  }

  // Fill background with faint dots at baseline (100)
  const baselineRow = Math.round(((maxY - 100) / range) * (height - 1));
  const clampedBaseline = Math.max(0, Math.min(height - 1, baselineRow));
  for (let x = 0; x < width; x++) {
    if (grid[clampedBaseline][x] === ' ') {
      grid[clampedBaseline][x] = '─';
    }
  }

  // Print header
  console.log('\n  ' + chalk.white.bold('📈 Equity Curves — Normalized (start = 100)'));
  console.log('  ' + chalk.gray(`  100% baseline ─────────────────────────────────────────────────`));

  // Print Y-axis labels + grid
  const yLabelAt = [0, Math.floor(height / 2), height - 1];
  const yVals = [maxY, (maxY + minY) / 2, minY];

  for (let row = 0; row < height; row++) {
    const yLabel = yLabelAt.includes(row)
      ? chalk.gray(yVals[yLabelAt.indexOf(row)].toFixed(0).padStart(4))
      : '    ';

    const line = grid[row].map((cell) => {
      if (cell === '─') return chalk.gray('─');
      if (cell === ' ') return ' ';
      const match = cell.match(/^\x00(\d)$/);
      if (match) {
        const si = parseInt(match[1], 10);
        return COLORS[si % COLORS.length](SYMBOLS[si % SYMBOLS.length]);
      }
      return cell;
    }).join('');

    console.log(`  ${yLabel} │${line}│`);
  }

  // X axis
  const xAxis = '─'.repeat(width);
  console.log('       └' + chalk.gray(xAxis) + '┘');
  console.log(chalk.gray('       Day 0' + ' '.repeat(width - 20) + 'Day ' + results[0].equityCurve.length));

  // Legend
  const legendItems = results.map((r, i) =>
    COLORS[i % COLORS.length](SYMBOLS[i % SYMBOLS.length] + ' ' + NAMES[i])
  );
  console.log('       ' + legendItems.join('   '));
  console.log('');
}

export function renderBacktestReport(results: BacktestResult[]): void {
  console.log('\n');
  console.log(chalk.cyan.bold('  ╔════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   2xSwap Agent — Backtest Results') + chalk.cyan.bold('                             ║'));
  console.log(chalk.cyan.bold('  ╚════════════════════════════════════════════════════════════════╝\n'));

  // Summary comparison table
  const summaryTable = new Table({
    head: [
      'Strategy',
      'Trades',
      'Win Rate',
      'Total PnL',
      'PnL %',
      'Max DD',
      'Sharpe',
      'Liq. Avoided',
    ].map((h) => chalk.cyan(h)),
    style: { head: [], border: ['gray'] },
  });

  for (const r of results) {
    summaryTable.push([
      chalk.yellow(r.strategy.toUpperCase()),
      r.totalTrades.toString(),
      colorPct(r.winRate * 100),
      colorMoney(r.totalPnlUsdc),
      colorPct(r.totalPnlPct),
      chalk.red(`-${r.maxDrawdown.toFixed(1)}%`),
      colorSharpe(r.sharpeRatio),
      r.liquidationsAvoided > 0
        ? chalk.green.bold(`${r.liquidationsAvoided} 🛡️`)
        : chalk.gray('0'),
    ]);
  }

  console.log(chalk.white.bold('  📊 Strategy Comparison'));
  console.log(summaryTable.toString());

  // ASCII equity curve
  renderEquityCurve(results);

  // Detail for each strategy
  for (const r of results) {
    console.log(chalk.white.bold(`\n  📈 ${r.strategy.toUpperCase()} — Detailed Stats`));

    const detailTable = new Table({
      style: { border: ['gray'] },
    });

    detailTable.push(
      { 'Starting Capital': chalk.white(`$${r.startCapital.toFixed(0)}`), 'Ending Capital': chalk.white(`$${r.endCapital.toFixed(2)}`) },
      { 'Total Return': colorPct(r.totalPnlPct), 'Max Drawdown': chalk.red(`-${r.maxDrawdown.toFixed(1)}%`) },
      { 'Win Rate': colorPct(r.winRate * 100), 'Total Trades': r.totalTrades.toString() },
      { 'Avg Win': colorPct(r.avgWinPct), 'Avg Loss': colorPct(r.avgLossPct) },
      { 'Avg Hold Days': `${r.avgHoldDays.toFixed(1)}d`, 'Sharpe Ratio': colorSharpe(r.sharpeRatio) },
      { 'Liquidations Avoided*': chalk.green.bold(r.liquidationsAvoided.toString()), '(vs standard 2x protocols)': '' },
    );

    console.log(detailTable.toString());

    // Recent trades
    if (r.trades.length > 0) {
      const tradeTable = new Table({
        head: ['#', 'Asset', 'Open', 'Close', 'Days', 'PnL%', 'PnL $', 'Close Reason', 'Liq?'].map(h => chalk.cyan(h)),
        style: { head: [], border: ['gray'] },
        colWidths: [5, 6, 10, 10, 6, 8, 9, 30, 6],
        wordWrap: true,
      });

      // Show last 15 trades
      const recent = r.trades.slice(-15);
      for (const t of recent) {
        tradeTable.push([
          `#${t.id}`,
          t.asset.toUpperCase(),
          `$${t.openPrice.toFixed(0)}`,
          `$${t.closePrice.toFixed(0)}`,
          `${t.daysHeld.toFixed(1)}d`,
          colorPct(t.pnlPct),
          colorMoney(t.pnlUsdc),
          t.closeReason.slice(0, 28),
          t.wouldBeliquidated ? chalk.red('YES') : chalk.green('no'),
        ]);
      }

      console.log(chalk.white.bold('  🔄 Recent Trades'));
      console.log(tradeTable.toString());
    }
  }

  // Key takeaway box
  const best = [...results].sort((a, b) => b.totalPnlPct - a.totalPnlPct)[0];
  const totalLiqAvoided = results.reduce((s, r) => s + r.liquidationsAvoided, 0);

  console.log('\n  ' + chalk.bgGreen.black.bold(' KEY INSIGHT '));
  console.log(chalk.white(`\n  Best strategy: ${chalk.yellow.bold(best.strategy.toUpperCase())} — ${chalk.green.bold('+' + best.totalPnlPct.toFixed(1) + '%')} return`));
  if (totalLiqAvoided > 0) {
    console.log(chalk.white(`  Positions that would have been liquidated on standard protocols: ${chalk.red.bold(totalLiqAvoided)}`));
    console.log(chalk.white(`  → ${chalk.green.bold('All survived')} because 2xSwap has no liquidation. Agent held through drawdowns.`));
  }
  console.log(chalk.gray('\n  * "Liquidation Avoided" = position went -8% or more (typical liquidation threshold for 2x leverage elsewhere)'));
  console.log(chalk.gray('    2xSwap has no liquidation — agent can hold up to 1 year regardless of drawdown. ⚡\n'));
}

function colorPct(pct: number): string {
  const str = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  if (pct > 10) return chalk.green.bold(str);
  if (pct > 0) return chalk.green(str);
  if (pct < -10) return chalk.red.bold(str);
  if (pct < 0) return chalk.red(str);
  return chalk.gray('0.0%');
}

function colorMoney(amount: number): string {
  const str = `${amount >= 0 ? '+' : ''}$${Math.abs(amount).toFixed(2)}`;
  return amount >= 0 ? chalk.green(str) : chalk.red(str);
}

function colorSharpe(sharpe: number): string {
  const str = sharpe.toFixed(2);
  if (sharpe > 1) return chalk.green.bold(str);
  if (sharpe > 0) return chalk.green(str);
  if (sharpe < -1) return chalk.red.bold(str);
  return chalk.red(str);
}
