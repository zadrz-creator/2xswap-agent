/**
 * Backtest Report Renderer
 * Outputs a rich CLI report of backtesting results.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { BacktestResult } from './engine';

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
