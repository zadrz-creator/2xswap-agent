import chalk from 'chalk';
import Table from 'cli-table3';
import { TradingAgent } from './agent';
import { config } from './config';
import { fetchPrices, createPriceHistory, addPrice, getAssetPrices } from './utils/prices';
import { computeSignals } from './utils/indicators';
import { getVWAPData } from './strategies/vwap';
import { formatUnits } from 'ethers';

const REFRESH_MS = 15_000;

async function renderDashboard(agent: TradingAgent): Promise<void> {
  console.clear();
  const state = agent.currentState;

  // Header
  console.log(chalk.cyan.bold('\n  ╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   2xSwap Autonomous Trading Agent — Dashboard') + chalk.cyan.bold('           ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════════╝\n'));

  // Status bar
  const uptime = Math.floor((Date.now() - state.startTime) / 60000);
  console.log(
    chalk.gray('  Mode: ') + chalk.yellow(config.agentMode.toUpperCase()) +
    chalk.gray('  |  Wallet: ') + chalk.white(agent.walletAddress.slice(0, 8) + '...') +
    chalk.gray('  |  Uptime: ') + chalk.white(`${uptime}m`) +
    chalk.gray('  |  Cycles: ') + chalk.white(state.cycleCount.toString())
  );
  console.log();

  // Market Signals
  const ethPrices = getAssetPrices(state.priceHistory, 'eth');
  const btcPrices = getAssetPrices(state.priceHistory, 'btc');

  const signalTable = new Table({
    head: ['Asset', 'Price', 'RSI', 'VWAP Dev', 'BB Pos', 'Volatility', 'Signal'].map(h => chalk.cyan(h)),
    style: { head: [], border: ['gray'] },
  });

  if (ethPrices.length > 0) {
    const eth = computeSignals(ethPrices, 'ETH');
    const ethVwap = getVWAPData(ethPrices);
    signalTable.push([
      'ETH',
      `$${eth.price.toFixed(2)}`,
      eth.rsi?.toFixed(1) ?? '—',
      colorVWAPDev(ethVwap.vwapDeviation),
      ethVwap.bbPosition !== null ? colorBBPos(ethVwap.bbPosition) : '—',
      eth.volatility ? `${eth.volatility.toFixed(1)}%` : '—',
      colorSignal(eth.overallSignal),
    ]);
  }

  if (btcPrices.length > 0) {
    const btc = computeSignals(btcPrices, 'BTC');
    const btcVwap = getVWAPData(btcPrices);
    signalTable.push([
      'BTC',
      `$${btc.price.toFixed(2)}`,
      btc.rsi?.toFixed(1) ?? '—',
      colorVWAPDev(btcVwap.vwapDeviation),
      btcVwap.bbPosition !== null ? colorBBPos(btcVwap.bbPosition) : '—',
      btc.volatility ? `${btc.volatility.toFixed(1)}%` : '—',
      colorSignal(btc.overallSignal),
    ]);
  }

  if (ethPrices.length === 0 && btcPrices.length === 0) {
    signalTable.push([{ colSpan: 7, content: chalk.gray('Collecting price data...') }]);
  }

  console.log(chalk.white.bold('  📊 Market Signals'));
  console.log(signalTable.toString());
  console.log();

  // Positions
  const posTable = new Table({
    head: ['ID', 'Asset', 'Amount', 'Open Price', 'Current', 'P&L %', 'Age'].map(h => chalk.cyan(h)),
    style: { head: [], border: ['gray'] },
  });

  if (state.activePositions.length === 0) {
    posTable.push([{ colSpan: 7, content: chalk.gray('No active positions') }]);
  } else {
    for (const pos of state.activePositions) {
      const currentPrice = pos.asset === 'eth'
        ? ethPrices[ethPrices.length - 1] || 0
        : btcPrices[btcPrices.length - 1] || 0;
      const pnl = pos.openPrice > 0
        ? ((currentPrice - pos.openPrice) / pos.openPrice * 100)
        : 0;
      const age = Math.floor((Date.now() - pos.openTime) / (1000 * 3600));

      posTable.push([
        `#${pos.id.toString()}`,
        pos.asset.toUpperCase(),
        `$${pos.openAmount.toFixed(0)}`,
        pos.openPrice > 0 ? `$${pos.openPrice.toFixed(0)}` : '—',
        currentPrice > 0 ? `$${currentPrice.toFixed(0)}` : '—',
        colorPnL(pnl),
        `${age}h`,
      ]);
    }
  }

  console.log(chalk.white.bold('  📈 Active Positions'));
  console.log(posTable.toString());
  console.log();

  // Recent Decisions
  const decTable = new Table({
    head: ['Time', 'Action', 'Reasoning'].map(h => chalk.cyan(h)),
    style: { head: [], border: ['gray'] },
    colWidths: [12, 10, 50],
    wordWrap: true,
  });

  const recent = state.decisions.slice(-8);
  if (recent.length === 0) {
    decTable.push([{ colSpan: 3, content: chalk.gray('No decisions yet') }]);
  } else {
    for (const dec of recent) {
      const time = new Date(dec.timestamp).toLocaleTimeString('en-US', { hour12: false });
      decTable.push([
        time,
        colorAction(dec.action),
        dec.reason,
      ]);
    }
  }

  console.log(chalk.white.bold('  🧠 Recent Decisions'));
  console.log(decTable.toString());
  console.log();

  // Footer
  console.log(chalk.gray(`  Refreshing every ${REFRESH_MS / 1000}s | Ctrl+C to exit`));
  console.log(chalk.gray(`  2xSwap: No liquidation. No interest. No funding rates. Agent-safe leverage. ⚡`));
}

function colorVWAPDev(dev: number | null): string {
  if (dev === null) return chalk.gray('—');
  const str = `${dev >= 0 ? '+' : ''}${dev.toFixed(2)}%`;
  if (dev <= -3) return chalk.green.bold(str); // strongly below VWAP = buy zone
  if (dev <= -1) return chalk.green(str);
  if (dev >= 3) return chalk.red.bold(str);   // strongly above VWAP = sell zone
  if (dev >= 1) return chalk.red(str);
  return chalk.yellow(str); // near VWAP = neutral
}

function colorBBPos(pos: number): string {
  const str = pos.toFixed(2);
  if (pos <= 0.2) return chalk.green.bold(str);  // near lower band = oversold
  if (pos <= 0.4) return chalk.green(str);
  if (pos >= 0.8) return chalk.red.bold(str);    // near upper band = overbought
  if (pos >= 0.6) return chalk.red(str);
  return chalk.yellow(str); // middle = neutral
}

function colorSignal(signal: string): string {
  switch (signal) {
    case 'strong_buy': return chalk.green.bold('STRONG BUY');
    case 'buy': return chalk.green('BUY');
    case 'neutral': return chalk.yellow('NEUTRAL');
    case 'sell': return chalk.red('SELL');
    case 'strong_sell': return chalk.red.bold('STRONG SELL');
    default: return signal;
  }
}

function colorPnL(pnl: number): string {
  if (pnl === 0) return chalk.gray('—');
  const str = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
  return pnl >= 0 ? chalk.green(str) : chalk.red(str);
}

function colorAction(action: string): string {
  switch (action) {
    case 'open': return chalk.green.bold('OPEN');
    case 'close': return chalk.red.bold('CLOSE');
    case 'hold': return chalk.gray('HOLD');
    default: return action;
  }
}

// ── Main ────────────────────────────────────────────────────────

export async function startDashboard(): Promise<void> {
  const agent = new TradingAgent();

  // Initial price fetch
  try {
    const prices = await fetchPrices();
    addPrice(agent.currentState.priceHistory, prices);
  } catch (e) {
    console.log(chalk.yellow('Could not fetch initial prices, will retry...'));
  }

  // Render loop
  const render = async () => {
    try {
      const prices = await fetchPrices();
      addPrice(agent.currentState.priceHistory, prices);
    } catch {}
    await renderDashboard(agent);
  };

  await render();
  setInterval(render, REFRESH_MS);
}

if (require.main === module) {
  startDashboard().catch(console.error);
}
