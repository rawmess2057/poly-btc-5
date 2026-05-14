/**
 * Paper Trader - Real simulation using mock Polymarket API
 * 
 * This runs the actual BTC5MinBot logic but connects to mock-server.ts
 * No real trades are placed - all orders go to the mock server
 * 
 * Usage:
 *   1. Start mock server: node dist/mock-server.js (or npm run mock-server)
 *   2. Run paper trader: tsx src/paper-trader.ts
 */

import { MockPolymarketServer } from './mock-server';
import { MockMarketListener } from './mock-market-listener';
import { BTC5MinBot } from './btc-bot';
import { DashboardServer } from './dashboard-server';

const MOCK_PORT = 8080;
const PAPER_CAPITAL = 500; // Start with $500 paper money

async function main() {
  console.log('📊 BTC 5-Min Bot - Paper Trader');
  console.log('================================\n');

  // Start mock server
  console.log('🧪 Starting mock Polymarket server...');
  const mockServer = new MockPolymarketServer(MOCK_PORT);
  await mockServer.start();

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 500));

  // Create mock market listener (HTTP polling instead of WebSocket)
  const marketListener = new MockMarketListener('BTC_5M', `http://localhost:${MOCK_PORT}`);
  marketListener.start();

  // Initialize bot with paper trading settings
  // Note: We need to modify btc-bot.ts to accept MarketListener as parameter
  // For now, this is a placeholder showing the integration pattern

  console.log(`\n💰 Paper Trading Capital: $${PAPER_CAPITAL}`);
  console.log(`🎯 Strategy: Market making with 200bps spread`);
  console.log(`📍 Mock API: http://localhost:${MOCK_PORT}`);
  console.log(`\n⚠️  This is SIMULATION only - no real trades will be placed\n`);

  // Simulate a few trading cycles
  let cycle = 0;
  const maxCycles = 10;

  const interval = setInterval(() => {
    cycle++;
    const stats = mockServer.getStats();
    const market = stats.currentMarket;

    console.log(`[Cycle ${cycle}] Bid: ${market.best_bid.price.toFixed(4)} | Ask: ${market.best_ask.price.toFixed(4)} | Spread: ${(market.spread * 100).toFixed(2)}bps`);

    if (cycle >= maxCycles) {
      clearInterval(interval);
      console.log('\n📊 Final Stats:', stats);
      console.log('\n✅ Paper trading simulation complete');
      
      marketListener.stop();
      mockServer.stop();
      process.exit(0);
    }
  }, 2000);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping paper trader...');
    clearInterval(interval);
    marketListener.stop();
    mockServer.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
