#!/usr/bin/env node
import { TradingAgent } from './agent';
import { startDashboard } from './dashboard';
import { config } from './config';
import { logger } from './utils/logger';

const args = process.argv.slice(2);
const modeFlag = args.find((a) => a.startsWith('--mode='))?.split('=')[1]
  ?? (args.includes('--mode') ? args[args.indexOf('--mode') + 1] : undefined);

const mode = modeFlag ?? config.agentMode;

async function main() {
  logger.info(`Starting 2xSwap Agent in ${mode} mode...`);

  switch (mode) {
    case 'dashboard': {
      await startDashboard();
      break;
    }

    case 'monitor':
    case 'agent':
    case 'demo': {
      const agent = new TradingAgent();

      // Graceful shutdown
      process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down...');
        agent.stop();
        setTimeout(() => process.exit(0), 2000);
      });
      process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down...');
        agent.stop();
        setTimeout(() => process.exit(0), 2000);
      });

      await agent.start();
      break;
    }

    case 'backtest': {
      // Dynamic import to avoid loading ethers if not needed
      const { BacktestEngine } = await import('./backtest/engine');
      const { loadHistoricalBars, generateSyntheticBars } = await import('./backtest/historical');
      const { renderBacktestReport } = await import('./backtest/report');

      const days = parseInt(args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? '180', 10);
      const useSynthetic = args.includes('--synthetic');
      const capital = parseFloat(args.find((a) => a.startsWith('--capital='))?.split('=')[1] ?? '1000');

      logger.info(`Backtest mode: ${days} days | $${capital} capital`);

      let bars;
      if (useSynthetic) {
        bars = generateSyntheticBars(days);
      } else {
        try {
          bars = await loadHistoricalBars(days);
        } catch {
          logger.warn('CoinGecko fetch failed, using synthetic data');
          bars = generateSyntheticBars(days);
        }
      }

      const strategies = ['momentum', 'mean-reversion', 'combined'] as const;
      const results = [];
      for (const strategy of strategies) {
        const engine = new BacktestEngine(bars, strategy, capital, 0.25, 4);
        results.push(engine.run());
      }
      renderBacktestReport(results);
      break;
    }

    case 'info': {
      // One-shot: print protocol info and exit
      const agent = new TradingAgent();
      const info = await agent.getProtocolInfo();
      console.log('\n2xSwap Protocol Info:');
      console.log('─────────────────────────────');
      console.log('ETH Market:', JSON.stringify(info.eth, null, 2));
      console.log('BTC Market:', JSON.stringify(info.btc, null, 2));
      console.log('Pool:', JSON.stringify(info.pool, null, 2));

      const vault = await agent.getVaultInfo();
      if (vault) {
        console.log('Vault:', JSON.stringify(vault, null, 2));
      }
      break;
    }

    default:
      console.error(`Unknown mode: ${mode}`);
      console.log('Usage: ts-node src/index.ts --mode [monitor|agent|demo|dashboard|info]');
      process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
