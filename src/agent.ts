import { X2SwapClient, PositionCheck } from './contracts';
import { config } from './config';
import { logger, logDecision } from './utils/logger';
import { PriceHistory, createPriceHistory, addPrice, fetchPrices, PriceData } from './utils/prices';
import { evaluateStrategy, ActivePosition, StrategyState, TradeAction } from './strategies/momentum';
import { computeSignals } from './utils/indicators';
import { getAssetPrices } from './utils/prices';
import { usdcToWethPath, usdcToWbtcPath, wethToUsdcPath, wbtcToUsdcPath } from './utils/swap-path';
import { formatUnits } from 'ethers';

export interface AgentState {
  priceHistory: PriceHistory;
  activePositions: ActivePosition[];
  decisions: DecisionLog[];
  cycleCount: number;
  startTime: number;
}

export interface DecisionLog {
  timestamp: number;
  action: string;
  reason: string;
  data?: Record<string, unknown>;
}

export class TradingAgent {
  private client: X2SwapClient;
  private state: AgentState;
  private running = false;

  constructor() {
    this.client = new X2SwapClient();
    this.state = {
      priceHistory: createPriceHistory(200),
      activePositions: [],
      decisions: [],
      cycleCount: 0,
      startTime: Date.now(),
    };
  }

  get currentState(): AgentState {
    return this.state;
  }

  get walletAddress(): string {
    return this.client.address;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async start(): Promise<void> {
    logger.info('═══════════════════════════════════════════════════');
    logger.info('  2xSwap Autonomous Trading Agent v1.0');
    logger.info(`  Mode: ${config.agentMode}`);
    logger.info(`  Wallet: ${this.client.address}`);
    logger.info(`  Max per position: $${config.maxPositionUsdc}`);
    logger.info(`  Max total exposure: $${config.maxTotalExposureUsdc}`);
    logger.info('═══════════════════════════════════════════════════');

    // Load existing positions from chain
    await this.syncPositions();

    this.running = true;
    logger.info('Agent started. Beginning trading loop...\n');

    while (this.running) {
      try {
        await this.cycle();
      } catch (err) {
        logger.error('Cycle error', { error: (err as Error).message });
      }
      await sleep(config.loopIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
    logger.info('Agent stopping...');
  }

  // ── Single Cycle ────────────────────────────────────────────────

  async cycle(): Promise<void> {
    this.state.cycleCount++;
    const cycleStart = Date.now();

    // 1. Fetch prices
    const prices = await fetchPrices();
    addPrice(this.state.priceHistory, prices);
    logger.info(`Cycle #${this.state.cycleCount} | ETH: $${prices.eth.toFixed(0)} | BTC: $${prices.btc.toFixed(0)}`);

    // 2. Evaluate strategy
    const strategyState: StrategyState = {
      activePositions: this.state.activePositions,
      maxPositions: 4,
      maxPerPosition: config.maxPositionUsdc,
      maxTotalExposure: config.maxTotalExposureUsdc,
    };

    const actions = evaluateStrategy(this.state.priceHistory, strategyState);

    // 3. Execute actions
    for (const action of actions) {
      await this.executeAction(action, prices);
    }

    const elapsed = Date.now() - cycleStart;
    logger.debug(`Cycle completed in ${elapsed}ms`);
  }

  // ── Action Execution ────────────────────────────────────────────

  private async executeAction(action: TradeAction, prices: PriceData): Promise<void> {
    this.logAction(action);

    if (config.agentMode === 'monitor') {
      // In monitor mode, just log recommendations
      return;
    }

    if (config.agentMode === 'demo') {
      // In demo mode, simulate without on-chain execution
      if (action.type === 'open') {
        const fakeId = BigInt(Math.floor(Math.random() * 1000000));
        this.state.activePositions.push({
          id: fakeId,
          asset: action.asset,
          openPrice: action.asset === 'eth' ? prices.eth : prices.btc,
          openAmount: config.maxPositionUsdc,
          openTime: Date.now(),
        });
        logger.info(`[DEMO] Simulated open position #${fakeId} on ${action.asset.toUpperCase()}`);
      } else if (action.type === 'close') {
        this.state.activePositions = this.state.activePositions.filter(
          (p) => p.id !== action.positionId
        );
        logger.info(`[DEMO] Simulated close position #${action.positionId}`);
      }
      return;
    }

    // LIVE execution (agent mode)
    try {
      if (action.type === 'open') {
        const path = action.asset === 'eth' ? usdcToWethPath() : usdcToWbtcPath();
        const posId = await this.client.openPosition(
          action.asset,
          config.maxPositionUsdc,
          path
        );
        this.state.activePositions.push({
          id: posId,
          asset: action.asset,
          openPrice: action.asset === 'eth' ? prices.eth : prices.btc,
          openAmount: config.maxPositionUsdc,
          openTime: Date.now(),
        });
        logger.info(`✅ Position #${posId} opened on ${action.asset.toUpperCase()}`);
      } else if (action.type === 'close') {
        const path = action.asset === 'eth' ? wethToUsdcPath() : wbtcToUsdcPath();
        await this.client.closePosition(action.asset, action.positionId, path);
        this.state.activePositions = this.state.activePositions.filter(
          (p) => p.id !== action.positionId
        );
        logger.info(`✅ Position #${action.positionId} closed on ${action.asset.toUpperCase()}`);
      }
    } catch (err) {
      logger.error(`Failed to execute ${action.type}`, { error: (err as Error).message });
    }
  }

  // ── Position Sync ───────────────────────────────────────────────

  async syncPositions(): Promise<void> {
    try {
      const [ethPositions, btcPositions] = await Promise.all([
        this.client.getPositions('eth'),
        this.client.getPositions('btc'),
      ]);

      logger.info(`On-chain positions: ETH(${ethPositions.length}) BTC(${btcPositions.length})`);

      // Sync ETH positions
      for (const id of ethPositions) {
        const info = await this.client.getPositionInfo('eth', id);
        if (info.closeDate === 0n) {
          // Still open
          const exists = this.state.activePositions.find((p) => p.id === id);
          if (!exists) {
            this.state.activePositions.push({
              id,
              asset: 'eth',
              openPrice: 0, // Unknown from chain data alone
              openAmount: Number(formatUnits(info.openAssetAmount, 6)),
              openTime: Number(info.openDate) * 1000,
            });
          }
        }
      }

      // Sync BTC positions
      for (const id of btcPositions) {
        const info = await this.client.getPositionInfo('btc', id);
        if (info.closeDate === 0n) {
          const exists = this.state.activePositions.find((p) => p.id === id);
          if (!exists) {
            this.state.activePositions.push({
              id,
              asset: 'btc',
              openPrice: 0,
              openAmount: Number(formatUnits(info.openAssetAmount, 6)),
              openTime: Number(info.openDate) * 1000,
            });
          }
        }
      }
    } catch (err) {
      logger.warn('Could not sync positions from chain', { error: (err as Error).message });
    }
  }

  // ── Position Checking ───────────────────────────────────────────

  async checkAllPositions(): Promise<Map<bigint, PositionCheck>> {
    const results = new Map<bigint, PositionCheck>();
    for (const pos of this.state.activePositions) {
      try {
        const path = pos.asset === 'eth' ? wethToUsdcPath() : wbtcToUsdcPath();
        const check = await this.client.checkPosition(pos.asset, pos.id, path);
        results.set(pos.id, check);
      } catch (err) {
        logger.warn(`Failed to check position #${pos.id}`, { error: (err as Error).message });
      }
    }
    return results;
  }

  // ── Info Getters ────────────────────────────────────────────────

  async getProtocolInfo() {
    const [ethInfo, btcInfo, poolInfo] = await Promise.all([
      this.client.getProtocolInfo('eth'),
      this.client.getProtocolInfo('btc'),
      this.client.getPoolInfo(),
    ]);
    return { eth: ethInfo, btc: btcInfo, pool: poolInfo };
  }

  async getVaultInfo() {
    return await this.client.getVaultInfo();
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private logAction(action: TradeAction): void {
    const entry: DecisionLog = {
      timestamp: Date.now(),
      action: action.type,
      reason: action.reason,
    };
    if (action.type === 'open') {
      entry.data = { asset: action.asset, confidence: action.confidence };
    }
    this.state.decisions.push(entry);
    // Keep last 100 decisions
    if (this.state.decisions.length > 100) {
      this.state.decisions = this.state.decisions.slice(-100);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
