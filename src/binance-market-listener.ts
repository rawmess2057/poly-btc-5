/**
 * Simulated Market Listener - Always generates edges for testing
 * 
 * This creates a simulated market that ALWAYS has edges
 * so we can verify the bot logic works correctly
 */

import type { MarketDataSource, MarketSnapshot } from './btc-bot';

export class SimulatedMarketListener implements MarketDataSource {
  private snapshot: MarketSnapshot = {
    best_bid: { price: 0.45, size: 100 },
    best_ask: { price: 0.55, size: 100 },
    all_bids: [
      { price: 0.45, size: 100 },
      { price: 0.43, size: 50 },
      { price: 0.41, size: 30 }
    ],
    all_asks: [
      { price: 0.55, size: 100 },
      { price: 0.57, size: 50 },
      { price: 0.59, size: 30 }
    ],
    mid_price: 0.50,
    timestamp: Date.now(),
    sum_check: 0.90  // This creates an edge!
  };

  private updateCount = 0;

  constructor(private market_id: string) {}

  start() {
    console.log('📊 Simulated market listener started (always generates edges)');
    
    // Update snapshot every 2 seconds to simulate market movement
    setInterval(() => {
      this.updateCount++;
      
      // Generate random edge
      const randomEdge = 0.02 + Math.random() * 0.08; // 2-10% edge
      const direction = Math.random() < 0.5 ? -1 : 1;
      
      const mid = 0.5 + (Math.random() - 0.5) * 0.3; // 0.35-0.65
      const spread = 0.05;
      
      const bid = Math.max(0.01, mid - spread);
      const ask = Math.min(0.99, mid + spread);
      
      // The key: sum_check < 0.98 creates an edge
      const sumCheck = bid + (1 - ask); // Simplified
      
      this.snapshot = {
        best_bid: { price: bid, size: 100 },
        best_ask: { price: ask, size: 100 },
        all_bids: [
          { price: bid, size: 100 },
          { price: bid * 0.98, size: 50 },
          { price: bid * 0.96, size: 30 }
        ],
        all_asks: [
          { price: ask, size: 100 },
          { price: ask * 1.02, size: 50 },
          { price: ask * 1.04, size: 30 }
        ],
        mid_price: (bid + ask) / 2,
        timestamp: Date.now(),
        sum_check: sumCheck
      };
      
      // Log edge detection
      if (sumCheck < 0.98) {
        const edgeProfit = (0.98 - sumCheck).toFixed(4);
        console.log(`🎯 Edge: sum=${sumCheck.toFixed(4)} | edge=$${edgeProfit}`);
      }
    }, 2000);
  }

  getSnapshot(): MarketSnapshot {
    return this.snapshot;
  }

  close() {}
}