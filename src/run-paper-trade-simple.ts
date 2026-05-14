/**
 * Simple Paper Trade - Mock server + bot in one process
 */

import { MockPolymarketServer } from './mock-server';
import { MockMarketListener } from './mock-market-listener';
import { MockOrderPlacer } from './mock-order-placer';
import { BTC5MinBot } from './btc-bot';
import { Wallet } from 'ethers';

const MOCK_PORT = 8080;
const MARKET_ID = 'BTC_5M';

async function main() {
  console.log('📊 BTC 5-Min Bot - PAPER TRADING (Simple)');
  console.log('============================================\n');

  // Start mock server in-process
  const mockServer = new MockPolymarketServer(MOCK_PORT);
  await mockServer.start();
  await new Promise(r => setTimeout(r, 1000));

  console.log('✅ Mock server started');

  // Create mock listener and placer
  const mockListener = new MockMarketListener(MARKET_ID, `http://localhost:${MOCK_PORT}`);
  mockListener.start();

  const mockPlacer = new MockOrderPlacer(`http://localhost:${MOCK_PORT}`);

  // Create wallet
  const privateKey = process.env.PRIVATE_KEY || Wallet.createRandom().privateKey;
  const wallet = new Wallet(privateKey);
  console.log(`👛 Paper Wallet: ${wallet.address}`);

  // Initialize bot with mocks
  // For paper trading, simulate being in the trading window
  // Start at 30s and advance slowly (cycle runs every 500ms)
  let mockSeconds = 30; // Start in trading window (25-71s)
  let callCount = 0;

  // Set lower edge threshold BEFORE creating bot (bot reads env at construction)
  process.env.MIN_EDGE_TO_TRADE = '0.001'; // 0.1% minimum edge

  console.log('🤖 Initializing BTC5MinBot...');
  const bot = new BTC5MinBot(MARKET_ID, privateKey, {
    listener: mockListener,
    placer: mockPlacer,
    secondsIntoCandle: () => {
      // Advance time slowly - every 10 calls = 1 second
      callCount++;
      if (callCount % 10 === 0) {
        mockSeconds++;
        if (mockSeconds > 71) mockSeconds = 30; // Loop back to trading window
      }
      return mockSeconds;
    }
  });

  console.log('✅ Bot initialized in PAPER MODE');
  console.log('⚠️  Orders go to mock server only\n');
  console.log('📈 Dashboard: http://localhost:3000\n');

  // Start the bot (begin polling cycles)
  bot.start();

  // Run for 60 seconds
  console.log('⏱️  Running simulation for 60 seconds...\n');

  const startTime = Date.now();
  const duration = 60000; // 60 seconds

  while (Date.now() - startTime < duration) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    const stats = mockServer.getStats();
    if (stats.totalOrders > 0 || elapsed % 10 === 0) {
      console.log(`[${elapsed}s] Orders: ${stats.totalOrders} (${stats.filledOrders} filled)`);
    }
  }

  console.log('\n📊 Final Stats:', mockServer.getStats());
  console.log('\n✅ Paper trading simulation complete!');
  console.log('   No real trades were placed.');

  mockListener.stop();
  mockServer.stop();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
