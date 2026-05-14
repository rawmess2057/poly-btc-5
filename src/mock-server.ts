// src/mock-server.ts
// Complete mock Polymarket API server for testing

import * as http from 'http';
import { MarketSnapshot } from './btc-bot';

export interface MockMarketData {
  best_bid: { price: number; size: number };
  best_ask: { price: number; size: number };
  mid_price: number;
  spread: number;
}

export class MockPolymarketServer {
  private server: http.Server | null = null;
  private orders: Map<string, any> = new Map();
  private orderCounter: number = 0;
  private currentMarketData: MockMarketData;
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
    this.currentMarketData = this.generateMarketData();
    console.log(`🧪 Mock Polymarket Server initializing on port ${port}`);
  }

  /**
   * Start mock server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`✅ Mock server running at http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = req.url || '/';
    const method = req.method || 'GET';

    console.log(`📨 ${method} ${url}`);

    try {
      // Market data endpoints
      if (url.includes('/book') && method === 'GET') {
        this.handleGetBook(res);
        return;
      }

      if (url.includes('/markets') && method === 'GET') {
        this.handleGetMarkets(res);
        return;
      }

      // Order endpoints
      if (url.includes('/orders') && method === 'POST') {
        this.handleCreateOrder(req, res);
        return;
      }

      if (url.includes('/orders') && method === 'GET') {
        this.handleGetOrders(res);
        return;
      }

      if (url.match(/\/orders\/[a-f0-9-]+/) && method === 'DELETE') {
        const orderId = url.split('/').pop();
        this.handleCancelOrder(orderId || '', res);
        return;
      }

      // Account endpoints
      if (url.includes('/balance') && method === 'GET') {
        this.handleGetBalance(res);
        return;
      }

      // Health check
      if (url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // Not found
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Get order book (market data)
   */
  private handleGetBook(res: http.ServerResponse): void {
    // Update market data (simulate price movement)
    this.currentMarketData = this.generateMarketData();

    const response = {
      asset_id: 'BTC_5M',
      bids: [
        { price: this.currentMarketData.best_bid.price, size: this.currentMarketData.best_bid.size }
      ],
      asks: [
        { price: this.currentMarketData.best_ask.price, size: this.currentMarketData.best_ask.size }
      ],
      mid_price: this.currentMarketData.mid_price,
      spread: this.currentMarketData.spread,
      timestamp: Date.now()
    };

    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  /**
   * Get markets
   */
  private handleGetMarkets(res: http.ServerResponse): void {
    const response = {
      markets: [
        {
          market_id: 'BTC_5M',
          question: 'Will BTC be above $50k in 5 minutes?',
          outcome_tokens: [
            { token_id: 'YES', price: this.currentMarketData.best_bid.price },
            { token_id: 'NO', price: 1 - this.currentMarketData.best_ask.price }
          ]
        }
      ]
    };

    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  /**
   * Create order
   */
  private handleCreateOrder(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const orderData = JSON.parse(body);
        const orderId = `order-${++this.orderCounter}`;

        const order = {
          order_id: orderId,
          status: 'PENDING',
          side: orderData.side,
          price: orderData.price,
          size: orderData.size,
          created_at: Date.now(),
          updated_at: Date.now(),
          filled_size: 0
        };

        this.orders.set(orderId, order);

        // Simulate order fill after 100-500ms
        setTimeout(() => {
          if (this.orders.has(orderId)) {
            const existing = this.orders.get(orderId);
            existing.status = 'FILLED';
            existing.filled_size = existing.size;
            existing.updated_at = Date.now();
          }
        }, 100 + Math.random() * 400);

        console.log(`✅ Order created: ${orderId}`);

        res.writeHead(201);
        res.end(JSON.stringify(order));

      } catch (error) {
        console.error('Order creation error:', error);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid order data' }));
      }
    });
  }

  /**
   * Get orders
   */
  private handleGetOrders(res: http.ServerResponse): void {
    const orders = Array.from(this.orders.values());

    res.writeHead(200);
    res.end(JSON.stringify({ orders }));
  }

  /**
   * Cancel order
   */
  private handleCancelOrder(orderId: string, res: http.ServerResponse): void {
    if (this.orders.has(orderId)) {
      const order = this.orders.get(orderId);
      order.status = 'CANCELLED';
      order.updated_at = Date.now();

      console.log(`✅ Order cancelled: ${orderId}`);

      res.writeHead(200);
      res.end(JSON.stringify(order));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
  }

  /**
   * Get balance
   */
  private handleGetBalance(res: http.ServerResponse): void {
    const response = {
      balance: 500,
      available: 500,
      locked: 0,
      currency: 'USDC'
    };

    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  /**
   * Generate realistic market data
   */
  private generateMarketData(): MockMarketData {
    // Generate edges 50% of the time for paper trading (lower to make it realistic)
    if (Math.random() < 0.5) {
      // Create arbitrage opportunity: sum_check < 0.98
      // bid + (1 - ask) < 0.98 means there's a risk-free profit
      const bid = 0.48 + Math.random() * 0.03; // 0.48-0.51
      const ask = 0.50 + Math.random() * 0.03; // 0.50-0.53
      // Ensure sum_check < 0.98
      const sumCheck = bid + (1 - ask);
      if (sumCheck >= 0.98) {
        // Force an edge
        const ask = 0.52 + Math.random() * 0.02; // Higher ask = lower (1-ask)
        return {
          best_bid: { price: bid, size: 250 },
          best_ask: { price: ask, size: 250 },
          mid_price: (bid + ask) / 2,
          spread: 1 - ask + bid // This is sum_check
        };
      }
      
      return {
        best_bid: { price: bid, size: 250 },
        best_ask: { price: ask, size: 250 },
        mid_price: (bid + ask) / 2,
        spread: sumCheck
      };
    }

    // Normal market (no edge)
    const mid = 0.5 + (Math.random() - 0.5) * 0.1;
    const spread = 0.005 + Math.random() * 0.01;

    return {
      best_bid: {
        price: mid - spread / 2,
        size: 250
      },
      best_ask: {
        price: mid + spread / 2,
        size: 250
      },
      mid_price: mid,
      spread: spread
    };
  }

  /**
   * Stop server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else {
            console.log('🛑 Mock server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get statistics
   */
  getStats() {
    const orders = Array.from(this.orders.values());
    const filled = orders.filter(o => o.status === 'FILLED').length;
    const cancelled = orders.filter(o => o.status === 'CANCELLED').length;

    return {
      totalOrders: orders.length,
      filledOrders: filled,
      cancelledOrders: cancelled,
      pendingOrders: orders.length - filled - cancelled,
      currentMarket: this.currentMarketData
    };
  }
}

// ==================== TEST INTEGRATION ====================

/**
 * Configure bot to use mock server
 */
export function useMockServer(mockPort: number = 8080): { 
  apiUrl: string; 
  wsUrl: string;
  server: MockPolymarketServer;
} {
  const server = new MockPolymarketServer(mockPort);

  return {
    apiUrl: `http://localhost:${mockPort}`,
    wsUrl: `ws://localhost:${mockPort}`,
    server
  };
}

/**
 * Start mock server for testing
 */
export async function startMockServerForTesting(): Promise<MockPolymarketServer> {
  const server = new MockPolymarketServer(8080);
  await server.start();

  // Add some initial orders
  console.log('📊 Mock server ready for testing');
  console.log(`   API URL: ${server.getUrl()}`);
  console.log('   Use this in .env: POLYMARKET_API_URL=http://localhost:8080');

  return server;
}
