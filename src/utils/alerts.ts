/**
 * Telegram Alerts — position open/close notifications
 *
 * Sends real-time alerts when the agent opens or closes positions.
 * Supports any Telegram bot token + chat ID.
 * Falls back gracefully when not configured (no-op).
 */

import https from 'https';
import { logger } from './logger';

export interface AlertConfig {
  botToken?: string;
  chatId?: string;
  enabled: boolean;
}

function getAlertConfig(): AlertConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = !!(botToken && chatId);
  return { botToken, chatId, enabled };
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Telegram API error: ${res.statusCode} — ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Alert types ─────────────────────────────────────────────────────────────

export async function alertPositionOpen(
  asset: string,
  price: number,
  amount: number,
  positionId: bigint | string,
  strategy: string,
  reason: string,
  mode: string
): Promise<void> {
  const cfg = getAlertConfig();
  if (!cfg.enabled) return;

  const modeTag = mode === 'demo' ? ' [DEMO]' : '';
  const assetUpper = asset.toUpperCase();
  const priceStr = assetUpper === 'ETH'
    ? `$${price.toFixed(0)}`
    : `$${price.toFixed(0)}`;

  const msg = [
    `⚡ <b>2xSwap Agent — Position Opened${modeTag}</b>`,
    ``,
    `📈 <b>${assetUpper}</b> @ ${priceStr}`,
    `💰 Size: <b>$${amount.toLocaleString()}</b>`,
    `🎯 Strategy: <b>${strategy.toUpperCase()}</b>`,
    `🔖 Position ID: <code>${positionId}</code>`,
    ``,
    `📝 <i>${reason}</i>`,
    ``,
    `<b>No liquidation. No interest. Agent holds until exit conditions.</b> ⚡`,
  ].join('\n');

  try {
    await sendTelegramMessage(cfg.botToken!, cfg.chatId!, msg);
    logger.info('[Alert] Telegram: position open sent');
  } catch (err) {
    logger.warn('[Alert] Telegram send failed', { error: (err as Error).message });
  }
}

export async function alertPositionClose(
  asset: string,
  price: number,
  pnlPct: number,
  pnlUsdc: number,
  positionId: bigint | string,
  strategy: string,
  reason: string,
  holdDays: number,
  mode: string
): Promise<void> {
  const cfg = getAlertConfig();
  if (!cfg.enabled) return;

  const modeTag = mode === 'demo' ? ' [DEMO]' : '';
  const assetUpper = asset.toUpperCase();
  const priceStr = `$${price.toFixed(0)}`;
  const pnlEmoji = pnlPct >= 0 ? '✅' : '🔴';
  const pnlSign = pnlPct >= 0 ? '+' : '';
  const pnlUsdcSign = pnlUsdc >= 0 ? '+' : '';

  const msg = [
    `${pnlEmoji} <b>2xSwap Agent — Position Closed${modeTag}</b>`,
    ``,
    `📉 <b>${assetUpper}</b> exit @ ${priceStr}`,
    `💸 P&amp;L: <b>${pnlSign}${pnlPct.toFixed(1)}%</b> (${pnlUsdcSign}$${Math.abs(pnlUsdc).toFixed(2)})`,
    `⏱ Hold time: <b>${holdDays.toFixed(1)} days</b>`,
    `🎯 Strategy: <b>${strategy.toUpperCase()}</b>`,
    `🔖 Position ID: <code>${positionId}</code>`,
    ``,
    `📝 <i>${reason}</i>`,
  ].join('\n');

  try {
    await sendTelegramMessage(cfg.botToken!, cfg.chatId!, msg);
    logger.info('[Alert] Telegram: position close sent');
  } catch (err) {
    logger.warn('[Alert] Telegram send failed', { error: (err as Error).message });
  }
}

export async function alertAgentStarted(
  address: string,
  mode: string,
  maxPerPosition: number,
  maxExposure: number
): Promise<void> {
  const cfg = getAlertConfig();
  if (!cfg.enabled) return;

  const modeEmoji: Record<string, string> = {
    demo: '🎭',
    monitor: '👁',
    agent: '🤖',
  };

  const msg = [
    `${modeEmoji[mode] ?? '⚡'} <b>2xSwap Agent Started — ${mode.toUpperCase()} mode</b>`,
    ``,
    `👛 Wallet: <code>${address}</code>`,
    `💰 Max per trade: <b>$${maxPerPosition.toLocaleString()}</b>`,
    `🏦 Max exposure: <b>$${maxExposure.toLocaleString()}</b>`,
    ``,
    `Running 4 strategies: Momentum, Mean Reversion, VWAP, Combined`,
    `Monitoring ETH + BTC on Ethereum mainnet 📡`,
    ``,
    `<b>No liquidation. Agent holds through volatility. ⚡</b>`,
  ].join('\n');

  try {
    await sendTelegramMessage(cfg.botToken!, cfg.chatId!, msg);
    logger.info('[Alert] Telegram: agent started alert sent');
  } catch (err) {
    logger.warn('[Alert] Telegram send failed', { error: (err as Error).message });
  }
}

export async function alertCycleDigest(
  cycleNum: number,
  ethPrice: number,
  btcPrice: number,
  openPositions: number,
  totalPnlPct: number
): Promise<void> {
  const cfg = getAlertConfig();
  if (!cfg.enabled) return;

  // Only send digest every 24 cycles (approx 24 min at 1-min intervals, or 24h at 1h intervals)
  if (cycleNum % 24 !== 0) return;

  const pnlEmoji = totalPnlPct >= 0 ? '📈' : '📉';
  const pnlSign = totalPnlPct >= 0 ? '+' : '';

  const msg = [
    `📊 <b>2xSwap Agent — Cycle ${cycleNum} Digest</b>`,
    ``,
    `💱 ETH: <b>$${ethPrice.toFixed(0)}</b> | BTC: <b>$${btcPrice.toFixed(0)}</b>`,
    `📂 Open positions: <b>${openPositions}</b>`,
    `${pnlEmoji} Session P&amp;L: <b>${pnlSign}${totalPnlPct.toFixed(2)}%</b>`,
    ``,
    `<i>Agent running. Watching for setups. ⚡</i>`,
  ].join('\n');

  try {
    await sendTelegramMessage(cfg.botToken!, cfg.chatId!, msg);
    logger.info('[Alert] Telegram: cycle digest sent');
  } catch (err) {
    logger.warn('[Alert] Telegram send failed', { error: (err as Error).message });
  }
}
