import type { MarketDataSource, MarketSnapshot } from './btc-bot';

const WebSocket = require('ws') as any;
type WsMessage = string | Buffer | ArrayBuffer | Buffer[];

export class MarketListener implements MarketDataSource {
  private ws: any;
  private market_id: string;
  private snapshot: MarketSnapshot = {
    best_bid: { price: 0, size: 0 },
    best_ask: { price: 0, size: 0 },
    all_bids: [],
    all_asks: [],
    mid_price: 0,
    timestamp: Date.now(),
    sum_check: 1.0
  };

  constructor(market_id: string, ws_url: string) {
    this.market_id = market_id;
    this.ws = new WebSocket(ws_url);
    this.initializeConnection();
  }

  private initializeConnection() {
    this.ws.on('open', () => {
      console.log('📡 WebSocket connected');
      
      // Subscribe to order book updates for this market
      const subscribe_msg = {
        action: 'subscribe',
        channel: `book:${this.market_id}`,
      };
      
      this.ws.send(JSON.stringify(subscribe_msg));
    });

    this.ws.on('message', (data: WsMessage) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.channel === `book:${this.market_id}`) {
          this.updateSnapshot(msg.data);
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    });

    this.ws.on('error', (err: Error) => {
      console.error('WebSocket error:', err);
    });

    this.ws.on('close', () => {
      console.log('📡 WebSocket disconnected. Reconnecting in 3s...');
      setTimeout(() => this.reconnect(), 3000);
    });
  }

  private updateSnapshot(data: any) {
    // Parse order book from Polymarket format
    const bids = data.bids || [];
    const asks = data.asks || [];

    const bestBid = bids[0] || { price: 0, size: 0 };
    const bestAsk = asks[0] || { price: 0, size: 0 };
    const hasBook = bestBid.price > 0 && bestAsk.price > 0;

    this.snapshot = {
      best_bid: bestBid,
      best_ask: bestAsk,
      all_bids: bids,
      all_asks: asks,
      mid_price: hasBook ? (bestBid.price + bestAsk.price) / 2 : this.snapshot.mid_price,
      timestamp: Date.now(),
      sum_check: bestBid.price > 0 ? bestBid.price + (1 - (bestAsk.price || 0.5)) : 1
    };

    // Log sum < 1 opportunities
    if (this.snapshot.sum_check < 0.98) {
      console.log(`🎯 EDGE DETECTED: sum=${this.snapshot.sum_check.toFixed(3)} (profit: ${(0.98 - this.snapshot.sum_check).toFixed(4)})`);
    }
  }

  getSnapshot(): MarketSnapshot {
    return this.snapshot;
  }

  reconnect() {
    this.ws = new WebSocket(process.env.WS_URL!);
    this.initializeConnection();
  }

  close() {
    this.ws.close();
  }
}
