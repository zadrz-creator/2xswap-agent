import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function envNum(key: string, fallback?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) return Number(raw);
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var: ${key}`);
}

export const config = {
  // Network
  rpcUrl: env('RPC_URL'),
  chainId: envNum('CHAIN_ID', 1),

  // Wallet
  privateKey: env('PRIVATE_KEY'),

  // Contracts
  contracts: {
    x2swapWeth: env('X2SWAP_WETH', '0x3E77Ad644B4F5FF6AE0B9893bd7bD3CD0136A578'),
    x2swapWbtc: env('X2SWAP_WBTC', '0x8d47d68c92C445c4b583cFfAC6016730CB2059e5'),
    x2pool: env('X2POOL', '0x2a315fef86916b30905086c85a9cb55e5dcd7ed3'),
    usdc: env('USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
    uniswapRouter: env('UNISWAP_ROUTER', '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
    scopedVault: process.env.SCOPED_VAULT || '',
  },

  // Agent
  agentMode: env('AGENT_MODE', 'monitor') as 'monitor' | 'agent' | 'demo',
  loopIntervalMs: envNum('LOOP_INTERVAL_MS', 60_000),
  maxPositionUsdc: envNum('MAX_POSITION_USDC', 1000),
  maxTotalExposureUsdc: envNum('MAX_TOTAL_EXPOSURE_USDC', 5000),
  maxSlippageBps: envNum('MAX_SLIPPAGE_BPS', 100),
} as const;

export type Config = typeof config;
