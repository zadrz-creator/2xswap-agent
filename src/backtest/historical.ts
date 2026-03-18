/**
 * Historical Price Data Fetcher
 *
 * Uses CoinGecko's free API to pull historical ETH/BTC prices
 * for backtesting. No API key required for the free tier.
 */

import https from 'https';
import { PriceBar } from './engine';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': '2xSwap-Backtester/1.0' },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Fetch daily OHLC from CoinGecko.
 * @param coinId 'ethereum' or 'bitcoin'
 * @param days Number of days of history (max 365 for free tier)
 */
async function fetchCoinGeckoOHLC(coinId: string, days: number): Promise<{ timestamp: number; price: number }[]> {
  // CoinGecko /coins/{id}/market_chart endpoint — returns [timestamp, price] pairs
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  let data: string;
  try {
    data = await httpsGet(url);
  } catch (err) {
    throw new Error(`Failed to fetch ${coinId} from CoinGecko: ${(err as Error).message}`);
  }

  const json = JSON.parse(data);
  if (!json.prices || !Array.isArray(json.prices)) {
    throw new Error(`Invalid CoinGecko response for ${coinId}`);
  }

  return json.prices.map(([ts, price]: [number, number]) => ({ timestamp: ts, price }));
}

/**
 * Load historical price bars for ETH and BTC.
 * @param days Days of history to load (default 365)
 */
export async function loadHistoricalBars(days = 365): Promise<PriceBar[]> {
  console.log(`Fetching ${days} days of historical price data from CoinGecko...`);

  const [ethData, btcData] = await Promise.all([
    fetchCoinGeckoOHLC('ethereum', days),
    fetchCoinGeckoOHLC('bitcoin', days),
  ]);

  // Align by timestamp (normalize to day boundary)
  const ethByDay = new Map<number, number>();
  for (const { timestamp, price } of ethData) {
    const day = Math.floor(timestamp / 86400000) * 86400000;
    ethByDay.set(day, price);
  }

  const btcByDay = new Map<number, number>();
  for (const { timestamp, price } of btcData) {
    const day = Math.floor(timestamp / 86400000) * 86400000;
    btcByDay.set(day, price);
  }

  // Build merged bars
  const bars: PriceBar[] = [];
  const allDays = [...new Set([...ethByDay.keys(), ...btcByDay.keys()])].sort();

  for (const day of allDays) {
    const eth = ethByDay.get(day);
    const btc = btcByDay.get(day);
    if (eth && btc) {
      bars.push({ timestamp: day, eth, btc });
    }
  }

  console.log(`Loaded ${bars.length} price bars (${days} days)`);
  return bars;
}

/** Generate synthetic price bars for testing (sine wave + noise) */
export function generateSyntheticBars(
  days = 180,
  ethStart = 2000,
  btcStart = 40000,
): PriceBar[] {
  const bars: PriceBar[] = [];
  const now = Date.now();
  const msPerDay = 86400000;

  let eth = ethStart;
  let btc = btcStart;

  for (let i = 0; i < days; i++) {
    // Correlated random walk with some mean reversion
    const trend = Math.sin((i / days) * Math.PI * 3) * 0.002;
    const noise = () => (Math.random() - 0.5) * 0.04;
    const mr = (mean: number, price: number) => (mean - price) / mean * 0.01;

    eth = eth * (1 + trend + noise() + mr(ethStart * 1.1, eth));
    btc = btc * (1 + trend * 0.9 + noise() + mr(btcStart * 1.15, btc));

    bars.push({
      timestamp: now - (days - i) * msPerDay,
      eth: Math.max(eth, 100),
      btc: Math.max(btc, 1000),
    });
  }

  return bars;
}
