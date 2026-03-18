import { ethers } from 'ethers';

/**
 * Encode a Uniswap V3 multi-hop path.
 * Each segment: [token (20 bytes), fee (3 bytes), token (20 bytes)]
 */
export function encodePath(tokens: string[], fees: number[]): string {
  if (tokens.length !== fees.length + 1) {
    throw new Error('tokens.length must equal fees.length + 1');
  }

  let encoded = '0x';
  for (let i = 0; i < fees.length; i++) {
    encoded += tokens[i].slice(2).toLowerCase();
    encoded += fees[i].toString(16).padStart(6, '0');
  }
  encoded += tokens[tokens.length - 1].slice(2).toLowerCase();
  return encoded;
}

// Common Uniswap V3 fee tiers
export const FEE_LOW = 500;    // 0.05%
export const FEE_MED = 3000;   // 0.3%
export const FEE_HIGH = 10000; // 1%

// Well-known token addresses (Ethereum mainnet)
export const TOKENS = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
} as const;

/** USDC → WETH path via Uniswap V3 (0.3% pool) */
export function usdcToWethPath(): string {
  return encodePath([TOKENS.USDC, TOKENS.WETH], [FEE_MED]);
}

/** USDC → WBTC path via WETH intermediate */
export function usdcToWbtcPath(): string {
  return encodePath([TOKENS.USDC, TOKENS.WETH, TOKENS.WBTC], [FEE_MED, FEE_MED]);
}

/** WETH → USDC path */
export function wethToUsdcPath(): string {
  return encodePath([TOKENS.WETH, TOKENS.USDC], [FEE_MED]);
}

/** WBTC → USDC path via WETH intermediate */
export function wbtcToUsdcPath(): string {
  return encodePath([TOKENS.WBTC, TOKENS.WETH, TOKENS.USDC], [FEE_MED, FEE_MED]);
}
