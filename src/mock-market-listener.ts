import type { MarketDataSource, MarketSnapshot } from './btc-bot';

/**
 * Mock market listener that uses HTTP polling instead of WebSocket
 * Connects to mock-server.ts for paper trading simulation
 */
export class MockMarketListener implements MarketDataSource {
  private mockServerUrl: string;
  private marketId: string;
  private snapshot: MarketSnapshot;
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    marketId: string = 'BTC_5M',
    mockServerUrl: string = 'http://localhost:8080'
  ) {
    this.marketId = marketId;
    this.mockServerUrl = mockServerUrl;
    this.snapshot = this.emptySnapshot();
    console.log(`🧪 MockMarketListener: Connecting to ${mockServerUrl}`);
  }

  private emptySnapshot(): MarketSnapshot {
    return {
      best_bid: { price: 0.50, size: 250 },
      best_ask: { price: 0.50, size: 250 },
      all_bids: [{ price: 0.50, size: 250 }],
      all_asks: [{ price: 0.50, size: 250 }],
      mid_price: 0.50,
      timestamp: Date.now(),
      sum_check: 1.0
    };
  }

  /**
   * Start polling the mock server for market data
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`📡 MockMarketListener: Polling started for ${this.marketId}`);

    // Initial fetch
    this.fetchMarketData();

    // Poll every 500ms (simulating real-time updates)
    this.pollInterval = setInterval(() => {
      this.fetchMarketData();
    }, 500);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('📡 MockMarketListener: Polling stopped');
  }

  /**
   * Fetch market data from mock server
   */
  private async fetchMarketData(): Promise<void> {
    try {
      const response = await fetch(`${this.mockServerUrl}/book?market=${this.marketId}`);
      
      if (!response.ok) {
        console.error(`Mock server error: ${response.status}`);
        return;
      }

      const data = await response.json() as any;
      
      // Transform mock server response to MarketSnapshot format
      const bestBid = data.bids?.[0] || { price: 0.50, size: 250 };
      const bestAsk = data.asks?.[0] || { price: 0.50, size: 250 };

      this.snapshot = {
        best_bid: { price: bestBid.price, size: bestBid.size },
        best_ask: { price: bestAsk.price, size: bestAsk.size },
        all_bids: (data.bids || []).map((b: any) => ({ price: b.price, size: b.size })),
        all_asks: (data.asks || []).map((a: any) => ({ price: a.price, size: a.size })),
        mid_price: data.mid_price || (bestBid.price + bestAsk.price) / 2,
        timestamp: data.timestamp || Date.now(),
        sum_check: bestBid.price + (1 - bestAsk.price)
      };

      // Log edge opportunities
      if (this.snapshot.sum_check < 0.98) {
        console.log(`🎯 EDGE DETECTED: sum=${this.snapshot.sum_check.toFixed(3)} (profit: ${(0.98 - this.snapshot.sum_check).toFixed(4)})`);
      }
    } catch (error) {
      console.error('MockMarketListener fetch error:', error);
    }
  }

  getSnapshot(): MarketSnapshot {
    return this.snapshot;
  }

  close(): void {
    this.stop();
  }
}
