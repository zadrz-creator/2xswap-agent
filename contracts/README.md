# ScopedVault — Smart Contract

The `ScopedVault` is the on-chain safety layer that makes AI agent-managed DeFi positions safe to fund.

## The Problem It Solves

Without a scoped vault, funding an AI trading agent means giving it full wallet access. One bug, jailbreak, or bad prompt = total loss.

`ScopedVault` enforces spending limits **at the contract level** — the agent physically cannot exceed the limits the owner set, even if it wanted to.

## How It Works

```
Owner → deposits USDC → sets limits → sets agent address
                         ↓
                   ScopedVault (gatekeeper)
                    - maxPerTrade: max USDC per single position
                    - maxTotalExposure: max aggregate open exposure
                    - timeWindow: rolling trade frequency limit
                         ↓ (enforces limits on every call)
                     2xSwap Protocol
                    X2Swap WETH | X2Swap WBTC
```

**Critical invariant:** The agent address can **only** call `executeOpenPosition` and `executeClosePosition`. It **cannot** call `withdraw`. Only the owner can withdraw.

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Agent can't withdraw | `onlyOwner` modifier on `withdraw()` |
| Per-trade limit | Enforced in `executeOpenPosition()` before any ERC20 transfer |
| Total exposure cap | `currentExposure + tradeSize ≤ maxTotalExposure` checked at open |
| Owner can disable agent instantly | `setAgent(address(0))` takes effect immediately |
| Full audit trail | Every position open/close emits indexed events |
| Position tracking | `positionX2Swap[id]` maps position IDs to their X2Swap contract |

## Files

```
contracts/
├── src/
│   ├── ScopedVault.sol   ← main contract
│   ├── MockUSDC.sol      ← test helper
│   └── MockX2Swap.sol    ← test helper (simulates 2xSwap)
├── test/
│   └── ScopedVault.test.ts  ← 35 tests
├── hardhat.config.ts
└── package.json
```

## Running Tests

```bash
cd contracts
npm install
npm test
```

**Expected output: 35/35 tests passing**

The test suite covers:
- Deployment and initial state (6 tests)
- Access control — the core safety property (6 tests)
- Per-trade limit enforcement (2 tests)
- Exposure limit enforcement (5 tests)
- Owner configuration (6 tests)
- Events and audit trail (4 tests)
- Core thesis — agent-safe leverage lifecycle (6 tests)

Test 7.6 is particularly important: it runs the full `open → hold → advance time → close` lifecycle, simulating how an agent holds a position through a 24-hour window without forced liquidation — the exact scenario that breaks on traditional perp protocols.

## 2xSwap Integration

The vault calls the real 2xSwap X2Swap contracts:
- `X2Swap (WETH)`: `0x3E77Ad644B4F5FF6AE0B9893bd7bD3CD0136A578`
- `X2Swap (WBTC)`: `0x8d47d68c92C445c4b583cFfAC6016730CB2059e5`

Both are on Ethereum mainnet. The vault works with either contract; the agent specifies which one when calling `executeOpenPosition`.

## Why This + 2xSwap = The Right Stack for AI Agents

Traditional perp protocols have two problems for AI agents:
1. **Liquidation** — a -50% wick kills the position before the agent can react
2. **Full wallet access** — the agent can drain the wallet

2xSwap solves #1 (no liquidation, no funding rates, hold up to 1 year).
ScopedVault solves #2 (bounded spending, owner-only withdrawal).

Together: an AI agent that can trade leveraged positions, hold through volatility, and cannot cause more damage than the owner approved.

---

*ScopedVault — Synthesis Hackathon 2026 — Built by Zadrz ⚡*
