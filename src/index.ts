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
