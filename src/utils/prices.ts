import { logger } from './logger';

export interface PriceData {
  eth: number;
  btc: number;
  timestamp: number;
}

export interface PriceHistory {
  prices: PriceData[];
  maxLength: number;
}

export function createPriceHistory(maxLength = 200): PriceHistory {
  return { prices: [], maxLength };
}

export function addPrice(history: PriceHistory, price: PriceData): void {
  history.prices.push(price);
  if (history.prices.length > history.maxLength) {
    history.prices.shift();
  }
}

/**
 * Fetch current ETH & BTC prices from CoinGecko (free, no key required).
 * Falls back to CoinCap if CoinGecko rate-limited.
 */
export async function fetchPrices(): Promise<PriceData> {
  try {
    return await fetchCoinGecko();
  } catch (e) {
    logger.warn('CoinGecko failed, falling back to CoinCap', { error: (e as Error).message });
    return await fetchCoinCap();
  }
}

async function fetchCoinGecko(): Promise<PriceData> {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd';
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json() as Record<string, { usd: number }>;
  return {
    eth: data.ethereum.usd,
    btc: data.bitcoin.usd,
    timestamp: Date.now(),
  };
}

async function fetchCoinCap(): Promise<PriceData> {
  const [ethRes, btcRes] = await Promise.all([
    fetch('https://api.coincap.io/v2/assets/ethereum', { signal: AbortSignal.timeout(10_000) }),
    fetch('https://api.coincap.io/v2/assets/bitcoin', { signal: AbortSignal.timeout(10_000) }),
  ]);
  if (!ethRes.ok || !btcRes.ok) throw new Error('CoinCap failed');
  const ethData = await ethRes.json() as { data: { priceUsd: string } };
  const btcData = await btcRes.json() as { data: { priceUsd: string } };
  return {
    eth: parseFloat(ethData.data.priceUsd),
    btc: parseFloat(btcData.data.priceUsd),
    timestamp: Date.now(),
  };
}

/** Get array of a specific asset's prices from history */
export function getAssetPrices(history: PriceHistory, asset: 'eth' | 'btc'): number[] {
  return history.prices.map((p) => p[asset]);
}
