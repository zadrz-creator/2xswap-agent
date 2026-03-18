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
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Price Oracle  │  │   Strategy   │  │   Position    │  │
│  │  CoinGecko   │──│  Momentum    │──│   Manager     │  │
│  │  CoinCap     │  │  RSI + MA    │  │  Open/Close   │  │
│  └──────────────┘  └──────────────┘  └───────┬───────┘  │
│                                               │          │
│  ┌──────────────┐  ┌──────────────┐          │          │
│  │  Dashboard   │  │   Logger     │          │          │
│  │  Terminal UI │  │  Decisions   │          │          │
│  └──────────────┘  └──────────────┘          │          │
│                                               │          │
├───────────────────────────────────────────────┼──────────┤
│                                               │          │
│  ┌────────────────────────────────────────────▼────────┐ │
│  │              ScopedVault.sol (on-chain)              │ │
│  │                                                      │ │
│  │  Owner deposits USDC → Sets limits → Agent trades   │ │
│  │  • Max per trade    • Max total exposure             │ │
│  │  • Time windows     • Full event audit trail         │ │
│  │  • Owner withdraws anytime                           │ │
│  └────────────────────────┬─────────────────────────────┘ │
│                           │                               │
├───────────────────────────┼───────────────────────────────┤
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              2xSwap Protocol (Ethereum)              │  │
│  │                                                      │  │
│  │  X2Swap WETH    X2Swap WBTC    X2Pool (ERC-4626)    │  │
│  │  2x Long ETH    2x Long BTC    Provide Liquidity    │  │
│  │                                                      │  │
│  │  No liquidation. No interest. No funding rates.      │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
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

# Agent mode — LIVE trading (use with caution!)
npm run dev -- --mode agent

# Info — one-shot protocol info dump
npm run dev -- --mode info
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

## Strategy: Momentum

The agent uses a simple but effective momentum strategy:

**Entry signals:**
- RSI < 40 (oversold zone)
- SMA(7) crosses above SMA(25) (bullish crossover)
- Picks the stronger signal between ETH and BTC

**Exit signals:**
- Take profit at +15%
- Soft stop at -10% (no forced liquidation — agent *chooses* when to exit)
- Strong sell signal (RSI > 70 + bearish crossover)
- Position approaching 1-year expiry

**Key insight:** On traditional perps, the -10% stop would be a *liquidation* on 2x leverage. On 2xSwap, it's a *choice*. The agent can ride through the dip if signals suggest recovery.

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
- **winston** — structured logging

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

## License

MIT

---

Built for the [Synthesis Hackathon](https://synthesis.md) by the 2xSwap team.
