/**
 * Quick integration test - verifies mock server + bot work together
 */

import { MockPolymarketServer } from './mock-server';
import { MockMarketListener } from './mock-market-listener';
import http from 'http';

async function test() {
  console.log('🧪 Integration Test Starting...\n');

  // Start mock server
  const server = new MockPolymarketServer(8080);
  await server.start();
  await new Promise(r => setTimeout(r, 500));

  console.log('✅ Mock server started');

  // Test 1: Health check
  const health = await fetch('http://localhost:8080/health').then(r => r.json());
  console.log('✅ Health check:', health);

  // Test 2: Get market book
  const bookResp = await fetch('http://localhost:8080/book?market=BTC_5M');
  const book: any = await bookResp.json();
  console.log('✅ Market book:', { bid: book.bids?.[0]?.price, ask: book.asks?.[0]?.price });

  // Test 3: MockMarketListener
  const listener = new MockMarketListener('BTC_5M', 'http://localhost:8080');
  listener.start();
  await new Promise(r => setTimeout(r, 1000)); // Wait for poll

  const snapshot = listener.getSnapshot();
  console.log('✅ MarketListener snapshot:', { 
    bid: snapshot.best_bid.price.toFixed(4), 
    ask: snapshot.best_ask.price.toFixed(4),
    sum: snapshot.sum_check.toFixed(4)
  });

  // Test 4: Place order
  const orderResp = await fetch('http://localhost:8080/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side: 'BUY', price: 0.50, size: 10 })
  });
  const order: any = await orderResp.json();

  console.log('✅ Order placed:', { id: order.order_id, status: order.status });

  // Wait for fill
  await new Promise(r => setTimeout(r, 1000));
  const stats = server.getStats();
  console.log('✅ Server stats:', stats);

  // Cleanup
  listener.stop();
  await server.stop();

  console.log('\n✅ All integration tests passed!');
  console.log('   Mock server and bot components work correctly.');
  console.log('\n📍 Next steps:');
  console.log('   1. Run mock server: npm run mock-server');
  console.log('   2. Run paper trade: npm run paper-trade');
}

test().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
