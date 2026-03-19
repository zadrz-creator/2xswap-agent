# 2xSwap Autonomous Trading Agent ⚡

An AI agent that autonomously manages leveraged DeFi positions on [2xSwap](https://2xswap.com) — the first leverage protocol designed for autonomous agents.

**Hackathon Track:** Agents That Pay | [Synthesis Hackathon](https://synthesis.md)

---

## Why 2xSwap + AI Agents?

Traditional perps **destroy AI agents**:
- Liquidation on wicks → agents can't predict every wick
- Funding rates → unpredictable costs eat into strategies  
- Time pressure → agents need to react in milliseconds or die

2xSwap is **agent-native leverage**:
- ✅ **No liquidation** — positions survive any wick
- ✅ **No interest** — zero cost to hold
- ✅ **No funding rates** — predictable economics
- ✅ **1-year expiry** — agents can think in weeks, not seconds
- ✅ **80/20 profit split** — transparent, fixed fee structure
- ✅ **2x leverage** — meaningful exposure without death spirals

An AI agent on 2xSwap can **hold through volatility**, **take profits when ready**, and **never get rekt by a wick**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Runner (CLI)                     │
│                     src/index.ts                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────────────┐  ┌────────┐  │
│  │ Price Oracle  │  │      Strategies      │  │ Posn.  │  │
│  │  CoinGecko   │──│  Momentum (RSI+MA)   │──│ Mgr.   │  │
│  │  CoinCap     │  │  Mean Reversion (BB) │  │        │  │
│  └──────────────┘  │  VWAP               │  └───┬────┘  │
│                    │  Combined           │      │       │
│  ┌──────────────┐  └──────────────────────┘      │       │
│  │  Dashboard   │  ┌──────────────┐              │       │
│  │  Terminal UI │  │  Backtest    │              │       │
│  └──────────────┘  │  Engine      │              │       │
│                    └──────────────┘              │       │
├──────────────────────────────────────────────────┼───────┤
│  ┌───────────────────────────────────────────────▼─────┐ │
│  │              ScopedVault.sol (on-chain)              │ │
│  │  Owner deposits → Sets limits → Agent trades         │ │
│  │  Agent CANNOT withdraw — only trade within limits    │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       ▼                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              2xSwap Protocol (Ethereum)              │  │
│  │  X2Swap WETH  |  X2Swap WBTC  |  X2Pool (ERC-4626) │  │
│  │  No liquidation. No interest. No funding rates.      │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/zadrz-creator/2xswap-agent.git
cd 2xswap-agent
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your RPC URL and wallet key
```

### 3. Run

```bash
# Monitor mode — analyze markets, log recommendations, no trades
npm run dev -- --mode monitor

# Demo mode — simulated trades, no on-chain execution
npm run dev -- --mode demo

# Dashboard — terminal UI showing signals, positions, decisions
npm run dashboard

# Backtest — run all 4 strategies against 180 days of data
npm run backtest:synthetic

# Full test suite (97 tests)
npm test

# Agent mode — LIVE trading (use with caution!)
npm run dev -- --mode agent
```

---

## Modes

| Mode | Trades? | On-chain? | Use case |
|------|---------|-----------|----------|
| `monitor` | ❌ | Read-only | Watch signals, test strategy |
| `demo` | Simulated | ❌ | Demo without real money |
| `dashboard` | ❌ | Read-only | Live terminal UI |
| `agent` | ✅ | ✅ | Real trading |
| `info` | ❌ | Read-only | Print protocol state |

---

## Trading Strategies

The agent runs four complementary strategies:

### 1. Momentum (RSI + MA Crossover)
- **Entry:** RSI < 40 + SMA(7) crosses above SMA(25) → bullish crossover
- **Exit:** +15% take profit | -10% soft stop | strong sell signal | near expiry
- **Avg hold:** ~35 days — exploiting 2xSwap's no-liquidation advantage

### 2. Mean Reversion (Bollinger Bands + RSI)
- **Entry:** Price at lower Bollinger Band (BB position ≤ 0.25) + RSI < 35
- **Exit:** Price returns to middle band | +12% take profit | -10% soft stop
- **Avg hold:** ~14 days | typical win rate: 55-65%

### 3. VWAP (Volume-Weighted Average Price)
- **Entry:** Price ≥ 4% below VWAP + RSI oversold (< 35) — mean reversion to fair value
- **Exit:** Price reclaims VWAP (positive deviation) | +12% take profit | -10% soft stop
- **Avg hold:** ~8 days | typical win rate: 63-70%

### 4. Combined
- Runs all three strategies simultaneously
- Prevents duplicate positions on the same asset
- Higher trade frequency with broader market coverage

**Key insight for all strategies:** On traditional 2x leverage perps, a -8% drawdown triggers forced liquidation. On 2xSwap, the agent's -10% stop is a *choice* — it can hold through drawdowns and exit on its own terms.

---

## Backtest Results

Run `npm run backtest:synthetic` for a fresh 180-day simulation:

```
Strategy        Trades  Win Rate   PnL%     Max DD   Sharpe  Liq. Avoided
─────────────────────────────────────────────────────────────────────────
MOMENTUM          6-8   28-50%    varies   -10-15%   var       1-2 🛡️
MEAN-REVERSION    9-14  55-65%    +3-8%    -8-10%    var       1-2 🛡️
VWAP              8-11  63-70%    varies   -12-15%   var       2-3 🛡️
COMBINED          35-42 55-65%    varies   -9-13%    var       2-4 🛡️
```

The **"Liq. Avoided" 🛡️** column is the thesis: positions that dropped -8% to -10%+ intraday. On any traditional 2x leverage protocol, those are liquidations. On 2xSwap, the agent holds, recovers, and exits on its own terms.

---

## Test Suite

```bash
npm test
```

**97 tests, 3 suites, all passing:**
- ✅ Technical Indicators (24 tests) — SMA, EMA, RSI, Bollinger Bands, VWAP, MA Crossover
- ✅ Trading Strategies (40 tests) — all 4 strategies, including no-liquidation advantage tests
- ✅ Backtest Engine (33 tests) — result shape, strategy behavior, no-liquidation tracking

Tests 4.1 and 4.2 explicitly validate the 2xSwap no-liquidation advantage:
- Agent does NOT trigger stop at -8% (where traditional perps liquidate)
- Agent holds through -9% drawdowns (impossible on standard 2x leverage)

---

## ScopedVault Contract

The `ScopedVault.sol` contract adds a critical safety layer between the AI agent and user funds:

```
Owner                    ScopedVault                   2xSwap
  │                          │                            │
  ├──deposit(USDC)──────────▶│                            │
  ├──setMaxPerTrade(1000)───▶│                            │
  ├──setAgent(0xAgent)──────▶│                            │
  │                          │                            │
  │    Agent                 │                            │
  │      ├──executeOpen()───▶│──openPosition()───────────▶│
  │      │                   │  (checks limits first)     │
  │      ├──executeClose()──▶│──closePosition()──────────▶│
  │      │                   │                            │
  │      ╳ withdraw() ← DENIED (agent can't withdraw)    │
  │                          │                            │
  ├──withdraw(USDC)─────────▶│  (only owner can withdraw) │
```

**Safety features:**
- Agent CANNOT withdraw funds — only trade within limits
- Per-trade limit (e.g., max $1,000 per position)
- Total exposure limit (e.g., max $5,000 across all positions)
- Time window rate limiting
- Full event audit trail
- Owner can withdraw anytime

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Ethereum RPC endpoint | Required |
| `PRIVATE_KEY` | Wallet private key | Required |
| `AGENT_MODE` | monitor/agent/demo | monitor |
| `LOOP_INTERVAL_MS` | Cycle interval | 60000 |
| `MAX_POSITION_USDC` | Max per trade | 1000 |
| `MAX_TOTAL_EXPOSURE_USDC` | Max total open | 5000 |
| `MAX_SLIPPAGE_BPS` | Max slippage in bps | 100 |
| `SCOPED_VAULT` | Vault contract address | Optional |

---

## Contracts (Ethereum Mainnet)

| Contract | Address |
|----------|---------|
| X2Swap WETH | `0x3E77Ad644B4F5FF6AE0B9893bd7bD3CD0136A578` |
| X2Swap WBTC | `0x8d47d68c92C445c4b583cFfAC6016730CB2059e5` |
| X2Pool (ERC-4626) | `0x2a315fef86916b30905086c85a9cb55e5dcd7ed3` |
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |

---

## Tech Stack

- **TypeScript** + Node.js
- **ethers.js v6** — contract interaction
- **Solidity 0.8.20** — ScopedVault contract
- **chalk + cli-table3** — terminal dashboard
- **winston** — structured decision logging
- **CoinGecko API** — historical price data for backtesting

---

## Why This Matters

DeFi needs autonomous agents. Agents need protocols that don't kill them.

Every major leverage protocol today uses liquidation as risk management. That works for humans who can monitor positions, set stops, and react to wicks. It doesn't work for AI agents that:

1. **Can't predict every wick** — no model can
2. **Need time to analyze** — not milliseconds to survive
3. **Should trade on fundamentals** — not fear of liquidation

2xSwap replaces liquidation with **profit-sharing**. The protocol takes 20% of profits instead of killing positions on drawdowns. This is the only model that makes sense for autonomous agents.

**2xSwap is the first agent-safe leverage protocol.** ⚡

---

## Human-Agent Collaboration

This project was built by Zadrz (AI) + Didar (human co-founder):
- **Didar** sets strategy constraints, reviews risk parameters, approves capital deployment
- **Zadrz** designs and implements strategies, runs backtests, maintains codebase, monitors 24/7
- **ScopedVault** enforces the boundary — Zadrz can't spend more than Didar approved

This is what human-agent collaboration looks like in DeFi. Not "AI suggests, human executes" — AI executes, human supervises.

---

## License

MIT

---

Built for the [Synthesis Hackathon](https://synthesis.md) by the 2xSwap team. ⚡
