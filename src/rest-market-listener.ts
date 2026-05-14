/**
 * REST Market Listener - HTTP polling instead of WebSocket
 * 
 * Uses Polymarket REST API to fetch order book data
 * Works around SSL/TLS issues with WebSocket connections
 */

import axios from 'axios';
import type { MarketDataSource, MarketSnapshot } from './btc-bot';

export class RestMarketListener implements MarketDataSource {
  private market_id: string;
  private baseUrl: string;
  private pollingInterval: NodeJS.Timeout | null = null;
  
  private snapshot: MarketSnapshot = {
    best_bid: { price: 0, size: 0 },
    best_ask: { price: 0, size: 0 },
    all_bids: [],
    all_asks: [],
    mid_price: 0,
    timestamp: Date.now(),
    sum_check: 1.0
  };

  constructor(market_id: string, baseUrl: string = 'https://clob.polymarket.com') {
    this.market_id = market_id;
    this.baseUrl = baseUrl;
  }

  async start(pollIntervalMs: number = 2000) {
    console.log(`📊 REST Market Listener starting (polling every ${pollIntervalMs}ms)...`);
    
    // Initial fetch
    await this.fetchOrderBook();
    
    // Start polling
    this.pollingInterval = setInterval(() => {
      this.fetchOrderBook();
    }, pollIntervalMs);
  }

  private async fetchOrderBook() {
    try {
      // Get market info first to get the condition token
      const marketUrl = `${this.baseUrl}/markets/${this.market_id}`;
      const marketResp = await axios.get(marketUrl, { timeout: 5000 });
      
      const market = marketResp.data;
      if (!market || !market.condition_id) {
        console.warn('Market not found or no condition_id');
        return;
      }

      // Get order book using condition_id
      const bookUrl = `${this.baseUrl}/orderbook/${market.condition_id}`;
      const bookResp = await axios.get(bookUrl, { timeout: 5000 });
      
      const book = bookResp.data;
      
      if (book.bids && book.asks) {
        this.updateSnapshot(book.bids, book.asks);
      }
    } catch (error: any) {
      if (error.code === 'EPROTO' || error.message?.includes('SSL')) {
        console.error('SSL error with REST API too');
      } else {
        console.error('Failed to fetch order book:', error.message?.substring(0, 100));
      }
    }
  }

  private updateSnapshot(bids: any[], asks: any[]) {
    const sortedBids = bids
      .map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .filter((b: any) => b.price > 0 && b.size > 0)
      .sort((a: any, b: any) => b.price - a.price);

    const sortedAsks = asks
      .map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .filter((a: any) => a.price > 0 && a.size > 0)
      .sort((a: any, b: any) => a.price - b.price);

    const bestBid = sortedBids[0] || { price: 0, size: 0 };
    const bestAsk = sortedAsks[0] || { price: 0, size: 0 };
    const hasBook = bestBid.price > 0 && bestAsk.price > 0;

    this.snapshot = {
      best_bid: bestBid,
      best_ask: bestAsk,
      all_bids: sortedBids,
      all_asks: sortedAsks,
      mid_price: hasBook ? (bestBid.price + bestAsk.price) / 2 : this.snapshot.mid_price,
      timestamp: Date.now(),
      sum_check: bestBid.price > 0 ? bestBid.price + (1 - (bestAsk.price || 0.5)) : 1
    };

    // Log price updates
    if (this.snapshot.mid_price > 0) {
      console.log(`💹 Mid: $${this.snapshot.mid_price.toFixed(4)} | Bid: $${bestBid.price.toFixed(4)} | Ask: $${bestAsk.price.toFixed(4)}`);
    }
  }

  getSnapshot(): MarketSnapshot {
    return this.snapshot;
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  close() {
    this.stop();
  }
}