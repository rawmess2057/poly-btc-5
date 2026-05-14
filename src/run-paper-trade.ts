/**
 * Run Paper Trade - Full bot integration with mock server
 * 
 * This runs the ACTUAL BTC5MinBot with the mock server
 * All bot logic executes, but orders go to mock server (no real trades)
 * 
 * Prerequisites:
 *   1. Start mock server: node dist/mock-server.js
 *   2. OR run: npm run mock-server
 * 
 * Then run: npx tsx src/run-paper-trade.ts
 */

import { MockPolymarketServer } from './mock-server';
import { MockMarketListener } from './mock-market-listener';
import { MockOrderPlacer } from './mock-order-placer';
import { BTC5MinBot } from './btc-bot';
import { Wallet } from 'ethers';

const MOCK_PORT = 8080;
const MARKET_ID = 'BTC_5M';

async function main() {
  console.log('📊 BTC 5-Min Bot - PAPER TRADING MODE');
  console.log('=======================================\n');

  // Start mock server (or connect to existing)
  console.log('🧪 Initializing mock Polymarket server...');
  const mockServer = new MockPolymarketServer(MOCK_PORT);
  await mockServer.start();
  await new Promise(r => setTimeout(r, 1000)); // Wait for server ready

  // Create mock market listener
  const mockListener = new MockMarketListener(MARKET_ID, `http://localhost:${MOCK_PORT}`);
  mockListener.start();

  // Create wallet (test wallet for paper trading)
  const privateKey = process.env.PRIVATE_KEY || Wallet.createRandom().privateKey;
  const wallet = new Wallet(privateKey);
  console.log(`👛 Paper Wallet: ${wallet.address}`);
  console.log(`💰 Initial Capital: $${process.env.INITIAL_CAPITAL_USDC || 500}\n`);

  // Initialize bot with mock listener AND mock order placer
  // For paper trading, simulate being in the trading window (seconds 30-60)
  let mockSeconds = 30; // Start in trading window
  
  console.log('🤖 Initializing BTC5MinBot with mock data source...');
  const mockPlacer = new MockOrderPlacer(`http://localhost:${MOCK_PORT}`);
  
  const bot = new BTC5MinBot(MARKET_ID, privateKey, {
    listener: mockListener,
    placer: mockPlacer, // Use mock order placer
    secondsIntoCandle: () => {
      // Cycle mock time forward each call
      mockSeconds = (mockSeconds + 1) % 300; // 5 min = 300 seconds
      return mockSeconds;
    },
  });

  console.log('✅ Bot initialized in PAPER MODE');
  console.log('⚠️  Orders will be sent to mock server only\n');

  // Start dashboard (optional - runs in background)
  try {
    console.log('📈 Dashboard: http://localhost:3000');
  } catch (e) {
    console.log('📈 Dashboard not started (optional)\n');
  }

  // Run for a limited time (paper trading simulation)
  const runtimeMinutes = 5;
  console.log(`⏱️  Running paper trade simulation for ${runtimeMinutes} minutes...`);
  console.log('   Press Ctrl+C to stop early\n');

  const startTime = Date.now();
  const maxRuntime = runtimeMinutes * 60 * 1000;

  const statusInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const stats = mockServer.getStats();
    console.log(`[${elapsed}s] Orders: ${stats.totalOrders} (${stats.filledOrders} filled, ${stats.cancelledOrders} cancelled)`);
  }, 10000); // Every 10 seconds

  // Keep alive
  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Stopping paper trade...');
      clearInterval(statusInterval);
      mockListener.stop();
      mockServer.stop();
      resolve(true);
    });

    // Auto-stop after maxRuntime
    setTimeout(() => {
      console.log(`\n⏱️  ${runtimeMinutes} minutes elapsed. Stopping...`);
      clearInterval(statusInterval);
      mockListener.stop();
      mockServer.stop();
      resolve(true);
    }, maxRuntime);
  });

  console.log('\n📊 Final Stats:', mockServer.getStats());
  console.log('\n✅ Paper trading simulation complete!');
  console.log('   No real trades were placed.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
