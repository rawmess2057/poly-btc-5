# Paper Trading Guide

## Overview
Since we cannot connect to the real Polymarket API due to SSL issues (OpenSSL 3.0.13 + Node.js v24 incompatibility), we've built a complete mock infrastructure for paper trading simulation.

## What We Built

### 1. Mock Server (`src/mock-server.ts`)
- Complete mock of Polymarket API
- Runs on `http://localhost:8080` (HTTP, no SSL issues)
- Simulates:
  - Market data (`/book`, `/markets`)
  - Order placement (`/orders`)
  - Order cancellation
  - Balance queries
  - Health checks

### 2. Mock Market Listener (`src/mock-market-listener.ts`)
- Implements `MarketDataSource` interface
- Polls mock server via HTTP (instead of WebSocket)
- Feeds data to the bot exactly like the real `MarketListener`

### 3. Integration Test (`src/test-integration.ts`)
- Verifies all components work together
- Run: `npx tsx src/test-integration.ts`
- ✅ All tests passing

## How to Run Paper Trading

### Step 1: Start Mock Server (Terminal 1)
```bash
cd "/home/raw/Desktop/New Folder/poly-btc-5"
npm run mock-server
```
Output: `✅ Mock server running at http://localhost:8080`

### Step 2: Run Paper Trade Bot (Terminal 2)
```bash
cd "/home/raw/Desktop/New Folder/poly-btc-5"
npm run paper-trade
```
Output: Bot runs with mock data, no real trades placed

### Step 3: View Dashboard (Browser)
```
http://localhost:3000
```
Shows virtual capital, trades, and metrics

## What's Being Tested

The paper trade runs the **ACTUAL bot logic**:
- ✅ Square root scaling (`√(capital/500)`)
- ✅ 200bps spread
- ✅ Circuit breaker (15% daily loss / 25% drawdown)
- ✅ Trading window (30-270 seconds)
- ✅ Fee accounting (~1% per side)
- ✅ Order placement logic

Only difference: Orders go to mock server instead of real Polymarket.

## Limitations

1. **Mock server generates random prices** - Not real Polymarket data
2. **Orders "fill" automatically** after 100-500ms (simulated)
3. **No real market analysis** - Can't validate edge frequency

## Next Steps (When SSL is Fixed)

### Option A: Fix SSL Issue
- Try Node.js v22 (not v24)
- Update OpenSSL to 3.2+
- Use a proxy/bridge to Polymarket API

### Option B: Deploy to Working Environment
- Deploy to a server with proper SSL support
- Connect to real Polymarket API
- Run Phase 2: Real paper trade with actual market data

### Option C: Skip to Live Trading
- If mock testing passes, deploy directly to production
- Start with small capital ($50-100)
- Monitor closely with dashboard

## Files Created/Modified

| File | Purpose |
|------|---------|
| `src/mock-server.ts` | Complete Polymarket API mock |
| `src/mock-market-listener.ts` | HTTP polling market data source |
| `src/run-paper-trade.ts` | Paper trading entry point |
| `src/test-integration.ts` | Integration verification |
| `src/polymarket-mock.js` | (Deleted - replaced by TS version) |
| `package.json` | Added `mock-server` and `paper-trade` scripts |

## Current Status

- ✅ Build passing
- ✅ Integration test passing
- ✅ Mock server working
- ✅ Bot logic integrated with mock
- ❌ Real Polymarket API blocked (SSL error)
- ⏳ Ready for paper trading simulation

## Commands Quick Reference

```bash
npm run build          # Build TypeScript
npm run mock-server    # Start mock API server
npm run paper-trade    # Run bot with mock server
npx tsx src/test-integration.ts  # Run integration test
npm run dashboard      # Start dashboard (port 3000)
```
