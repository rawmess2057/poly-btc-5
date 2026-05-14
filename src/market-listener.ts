import type { MarketDataSource, MarketSnapshot } from './btc-bot';

const WebSocket = require('ws') as any;
type WsMessage = string | Buffer | ArrayBuffer | Buffer[];

export class MarketListener implements MarketDataSource {
  private ws: any;
  private market_id: string;
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private reconnectAttempts = 0;

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
    const demoMode = process.env.DEMO_MODE === 'true' || process.env.NETWORK === 'demo';
    const backtestMode = process.env.BACKTEST_MODE === 'true';
    
    if (demoMode && !backtestMode) {
      console.log('🧪 Demo mode - skipping WebSocket connection');
      return;
    }
    
    if (backtestMode) {
      console.log('📊 Backtest mode - connecting to REAL WebSocket');
    }
    
    this.ws = new WebSocket(ws_url);
    this.initializeConnection();
  }

  private initializeConnection() {
    this.ws.on('open', () => {
      console.log('📡 WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Subscribe to order book updates for this market
      const subscribe_msg = {
        type: 'market',
        assets_ids: [this.market_id],
        custom_feature_enabled: true
      };
      
      this.ws.send(JSON.stringify(subscribe_msg));
    });

    this.ws.on('message', (data: WsMessage) => {
      try {
        const parsed = JSON.parse(data.toString());
        const msgs = Array.isArray(parsed) ? parsed : [parsed];
        
        for (const msg of msgs) {
          if (msg.asset_id === this.market_id || msg.market === this.market_id) {
            this.updateSnapshot(msg);
          }
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    });

    this.ws.on('error', (err: Error) => {
      console.error('WebSocket error:', err);
    });

    this.ws.on('close', () => {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`📡 WebSocket disconnected. Reconnecting in ${delay / 1000}s...`);
      this.reconnectAttempts++;
      setTimeout(() => this.reconnect(), delay);
    });
  }

  private updateSnapshot(data: any) {
    if (data.event_type !== 'book' && data.event_type !== 'price_change') {
      return; // Ignore other events
    }

    const newBids = data.bids || [];
    const newAsks = data.asks || [];

    for (const b of newBids) {
      const p = parseFloat(b.price);
      const s = parseFloat(b.size);
      if (s === 0) this.bids.delete(p);
      else this.bids.set(p, s);
    }

    for (const a of newAsks) {
      const p = parseFloat(a.price);
      const s = parseFloat(a.size);
      if (s === 0) this.asks.delete(p);
      else this.asks.set(p, s);
    }

    const bidPrices = Array.from(this.bids.keys()).sort((a, b) => b - a);
    const askPrices = Array.from(this.asks.keys()).sort((a, b) => a - b);

    const bestBidPrice = bidPrices[0] || 0;
    const bestAskPrice = askPrices[0] || 0;

    const bestBid = { price: bestBidPrice, size: this.bids.get(bestBidPrice) || 0 };
    const bestAsk = { price: bestAskPrice, size: this.asks.get(bestAskPrice) || 0 };

    const hasBook = bestBid.price > 0 && bestAsk.price > 0;

    this.snapshot = {
      best_bid: bestBid,
      best_ask: bestAsk,
      all_bids: bidPrices.map((price) => ({ price, size: this.bids.get(price)! })),
      all_asks: askPrices.map((price) => ({ price, size: this.asks.get(price)! })),
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
    this.bids.clear();
    this.asks.clear();
    const wsUrl = process.env.WS_URL || 'wss://ws.polymarket.com';
    this.ws = new WebSocket(wsUrl);
    this.initializeConnection();
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
