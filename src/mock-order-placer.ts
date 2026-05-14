/**
 * Mock Order Placer - sends orders to mock server instead of real Polymarket
 * Used for paper trading simulation
 */
import type { OrderExecutor, ActiveOrder } from './btc-bot';

export class MockOrderPlacer implements OrderExecutor {
  private mockServerUrl: string;
  private activeOrders: Map<string, ActiveOrder> = new Map();

  constructor(mockServerUrl: string = 'http://localhost:8080') {
    this.mockServerUrl = mockServerUrl;
  }

  async placeBothSides(mid_price: number, spread_bps: number, size: number): Promise<{ buy_order_id?: string; sell_order_id?: string }> {
    // Calculate buy/sell prices from mid price and spread
    const spreadDecimal = spread_bps / 10000;
    const buyPrice = mid_price - spreadDecimal / 2;
    const sellPrice = mid_price + spreadDecimal / 2;

    console.log(`📝 Mock orders: BUY ${size} @ $${buyPrice.toFixed(4)}, SELL ${size} @ $${sellPrice.toFixed(4)}`);

    try {
      // Place buy order
      const buyResp = await fetch(`${this.mockServerUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: 'BUY',
          price: buyPrice,
          size: size,
          order_type: 'FOK'
        })
      });
      const buyData: any = await buyResp.json();

      // Place sell order
      const sellResp = await fetch(`${this.mockServerUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: 'SELL',
          price: sellPrice,
          size: size,
          order_type: 'FOK'
        })
      });
      const sellData: any = await sellResp.json();

      // Track orders
      const buyOrder: ActiveOrder = {
        order_id: buyData.order_id,
        side: 'BUY',
        price: buyPrice,
        size: size,
        timestamp: Date.now(),
        status: 'PENDING'
      };
      const sellOrder: ActiveOrder = {
        order_id: sellData.order_id,
        side: 'SELL',
        price: sellPrice,
        size: size,
        timestamp: Date.now(),
        status: 'PENDING'
      };

      this.activeOrders.set(buyOrder.order_id, buyOrder);
      this.activeOrders.set(sellOrder.order_id, sellOrder);

      // Simulate fills after delay
      setTimeout(() => {
        buyOrder.status = 'FILLED';
        sellOrder.status = 'FILLED';
        console.log(`✅ Mock orders FILLED: ${buyOrder.order_id}, ${sellOrder.order_id}`);
      }, 500);

      return {
        buy_order_id: buyData.order_id,
        sell_order_id: sellData.order_id
      };
    } catch (error) {
      console.error('Mock order placement failed:', error);
      throw error;
    }
  }

  async cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean> {
    console.log(`🔄 Mock CANCEL & REPLACE: ${order_id} -> price: $${new_price}, size: ${new_size}`);
    
    try {
      // Cancel old order
      await fetch(`${this.mockServerUrl}/orders/${order_id}`, {
        method: 'DELETE'
      });

      // Place new order (simple buy for demo)
      const resp = await fetch(`${this.mockServerUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: 'BUY',
          price: new_price,
          size: new_size,
          order_type: 'FOK'
        })
      });

      return resp.ok;
    } catch {
      return false;
    }
  }

  async cancelOrder(order_id: string): Promise<boolean> {
    console.log(`🚫 Mock CANCEL order: ${order_id}`);
    
    try {
      const response = await fetch(`${this.mockServerUrl}/orders/${order_id}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getActiveOrders(): ActiveOrder[] {
    return Array.from(this.activeOrders.values()).filter(o => o.status === 'PENDING');
  }

  async getBalance(): Promise<number> {
    try {
      const response = await fetch(`${this.mockServerUrl}/balance`);
      const data: any = await response.json();
      return data.balance || 500;
    } catch {
      return 500; // Default paper balance
    }
  }
}
