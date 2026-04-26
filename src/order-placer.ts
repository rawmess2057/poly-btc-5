import { ApiKeyCreds, Chain, ClobClient, OrderType, Side, TickSize } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { ActiveOrder, OrderExecutor } from './btc-bot';

type OrderSide = 'BUY' | 'SELL';

interface LiveConfig {
  host: string;
  chainId: Chain;
  tokenId: string;
  funderAddress?: string;
  signatureType: number;
}

export class OrderPlacer implements OrderExecutor {
  private client?: ClobClient;
  private signer: ethers.Wallet;
  private readonly active_orders: Map<string, ActiveOrder> = new Map();
  private readonly demoMode: boolean;
  private readonly liveConfig?: LiveConfig;
  private credsPromise?: Promise<ApiKeyCreds>;

  constructor(private market_id: string, private_key: string) {
    this.signer = new ethers.Wallet(private_key);
    this.demoMode =
      process.env.NODE_ENV === 'demo' ||
      process.env.DEMO_MODE === 'true' ||
      process.env.PRIVATE_KEY === 'your_demo_private_key_here';

    const tokenId = process.env.TOKEN_ID;
    const host = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';
    const chainId = this.resolveChainId(process.env.CHAIN_ID);

    if (!this.demoMode && tokenId) {
      this.liveConfig = {
        host,
        chainId,
        tokenId,
        funderAddress: process.env.FUNDER_ADDRESS,
        signatureType: Number(process.env.SIGNATURE_TYPE || '0')
      };
    }
  }

  private resolveChainId(raw?: string): Chain {
    if (raw === '80002') {
      return Chain.AMOY;
    }
    return Chain.POLYGON;
  }

  private async getClient(): Promise<ClobClient | undefined> {
    if (this.demoMode) {
      return undefined;
    }

    if (!this.liveConfig) {
      throw new Error('Missing TOKEN_ID for live trading. Set TOKEN_ID in .env.');
    }

    if (!this.credsPromise) {
      const bootstrapClient = new ClobClient(this.liveConfig.host, this.liveConfig.chainId, this.signer as any);
      this.credsPromise = bootstrapClient.createOrDeriveApiKey();
    }

    if (!this.client) {
      const creds = await this.credsPromise;
      this.client = new ClobClient(
        this.liveConfig.host,
        this.liveConfig.chainId,
        this.signer as any,
        creds,
        this.liveConfig.signatureType,
        this.liveConfig.funderAddress
      );
    }

    return this.client;
  }

  private buildDemoOrderId(side: OrderSide): string {
    return `demo-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private trackOrder(order_id: string, side: OrderSide, price: number, size: number) {
    this.active_orders.set(order_id, {
      order_id,
      side,
      price,
      size,
      timestamp: Date.now(),
      status: 'PENDING'
    });
  }

  async placeOrder(
    side: OrderSide,
    price: number,
    size: number,
    timeout_seconds: number = 60
  ): Promise<string | null> {
    try {
      if (price <= 0 || price >= 1) {
        console.error('Invalid price:', price);
        return null;
      }

      if (size <= 0) {
        console.error('Invalid size:', size);
        return null;
      }

      console.log(`📤 Placing ${side} order: ${size} @ $${price.toFixed(4)}`);

      if (this.demoMode) {
        const demoOrderId = this.buildDemoOrderId(side);
        this.trackOrder(demoOrderId, side, price, size);
        console.log(`✅ Demo order placed: ${demoOrderId}`);
        return demoOrderId;
      }

      const client = await this.getClient();
      if (!client || !this.liveConfig) {
        throw new Error('Live client is unavailable.');
      }

      const tickSize = (process.env.TICK_SIZE || '0.01') as TickSize;
      const order = await client.createAndPostOrder(
        {
          tokenID: this.liveConfig.tokenId,
          price,
          side: side === 'BUY' ? Side.BUY : Side.SELL,
          size,
          feeRateBps: parseInt(process.env.FEE_RATE_BPS || '0', 10),
          expiration: Math.floor(Date.now() / 1000) + timeout_seconds
        },
        {
          tickSize,
          negRisk: process.env.NEG_RISK === 'true'
        },
        OrderType.GTD
      );

      const orderId = order?.orderID || order?.id || order?.orderId;
      if (!orderId) {
        console.error('Order rejected:', order);
        return null;
      }

      this.trackOrder(orderId, side, price, size);
      console.log(`✅ Order placed: ${orderId}`);
      return orderId;
    } catch (err) {
      console.error('Order placement error:', err);
      return null;
    }
  }

  async cancelAndReplace(
    order_id: string,
    new_price: number,
    new_size: number
  ): Promise<boolean> {
    try {
      const existing = this.active_orders.get(order_id);
      if (!existing) {
        console.warn(`Order ${order_id} is not tracked locally; skipping replace.`);
        return false;
      }

      const start = Date.now();

      if (this.demoMode) {
        this.active_orders.delete(order_id);
      } else {
        const client = await this.getClient();
        await client?.cancelOrder({ orderID: order_id });
        this.active_orders.delete(order_id);
      }

      const cancel_latency = Date.now() - start;
      console.log(`⏱️ Cancel latency: ${cancel_latency}ms`);

      if (cancel_latency > 100) {
        console.warn('Cancellation took >100ms. The order may have been exposed.');
      }

      const new_id = await this.placeOrder(existing.side, new_price, new_size);
      return !!new_id;
    } catch (err) {
      console.error('Cancel/replace failed:', err);
      return false;
    }
  }

  async cancelOrder(order_id: string): Promise<boolean> {
    try {
      const existing = this.active_orders.get(order_id);
      if (!existing) {
        return false;
      }

      if (this.demoMode) {
        this.active_orders.delete(order_id);
      } else {
        const client = await this.getClient();
        await client?.cancelOrder({ orderID: order_id });
        this.active_orders.delete(order_id);
      }
      console.log(`✅ Cancelled order: ${order_id}`);
      return true;
    } catch (err) {
      console.error(`Failed to cancel order ${order_id}:`, err);
      return false;
    }
  }

  async placeBothSides(
    mid_price: number,
    spread_bps: number,
    size: number
  ): Promise<{ buy_order_id?: string; sell_order_id?: string }> {
    const spread = (spread_bps / 10000) / 2;
    const buy_price = Math.max(0.01, mid_price - spread);
    const sell_price = Math.min(0.99, mid_price + spread);

    console.log('\n📊 Placing both sides:');
    console.log(`   BUY  @ $${buy_price.toFixed(4)} (size: ${size})`);
    console.log(`   SELL @ $${sell_price.toFixed(4)} (size: ${size})`);

    const buy_id = await this.placeOrder('BUY', buy_price, size);
    const sell_id = await this.placeOrder('SELL', sell_price, size);

    return { buy_order_id: buy_id || undefined, sell_order_id: sell_id || undefined };
  }

  getActiveOrders(): ActiveOrder[] {
    return Array.from(this.active_orders.values());
  }

  getOrderStatus(order_id: string): ActiveOrder | undefined {
    return this.active_orders.get(order_id);
  }
}
