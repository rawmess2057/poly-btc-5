import { randomBytes } from 'crypto';
import { ActiveOrder, BTC5MinBot, MarketDataSource, MarketSnapshot, OrderExecutor } from './btc-bot';
import { DashboardMetricsStore } from './metrics';

interface DemoTradeGroup {
  trade_id: string;
  created_at: number;
  expected_profit: number;
  buy_order: ActiveOrder;
  sell_order: ActiveOrder;
}

class DemoMarketListener implements MarketDataSource {
  private tick = 0;
  private readonly scenarios: MarketSnapshot[] = [
    this.snapshot(0.512, 0.518, 0.994),
    this.snapshot(0.472, 0.528, 0.944),
    this.snapshot(0.469, 0.531, 0.938),
    this.snapshot(0.481, 0.524, 0.957),
    this.snapshot(0.495, 0.505, 0.99),
    this.snapshot(0.474, 0.527, 0.947),
    this.snapshot(0.470, 0.529, 0.941),
    this.snapshot(0.486, 0.521, 0.965)
  ];

  private snapshot(bestBidPrice: number, bestAskPrice: number, sumCheck: number): MarketSnapshot {
    return {
      best_bid: { price: bestBidPrice, size: 250 },
      best_ask: { price: bestAskPrice, size: 250 },
      all_bids: [{ price: bestBidPrice, size: 250 }],
      all_asks: [{ price: bestAskPrice, size: 250 }],
      mid_price: (bestBidPrice + bestAskPrice) / 2,
      timestamp: Date.now(),
      sum_check: sumCheck
    };
  }

  getSnapshot(): MarketSnapshot {
    const base = this.scenarios[this.tick % this.scenarios.length];
    this.tick++;
    return { ...base, timestamp: Date.now() };
  }

  close() {
    console.log('📡 Demo market listener closed');
  }
}

class DemoOrderPlacer implements OrderExecutor {
  private readonly activeOrders = new Map<string, ActiveOrder>();
  private readonly maxOrderAgeMs = 8_000;
  private readonly tradeGroups = new Map<string, DemoTradeGroup>();

  constructor(private readonly metrics: DashboardMetricsStore) {}

  async placeBothSides(mid_price: number, spread_bps: number, size: number) {
    this.settleExpiredTrades();

    const halfSpread = (spread_bps / 10000) / 2;
    const buy = this.createOrder('BUY', Math.max(0.01, mid_price - halfSpread), size);
    const sell = this.createOrder('SELL', Math.min(0.99, mid_price + halfSpread), size);
    const expectedProfit = (spread_bps / 10000) * size * 2 * mid_price + (0.001 * size * 2 * mid_price);
    const tradeId = `pair:${buy.order_id}:${sell.order_id}`;

    this.tradeGroups.set(tradeId, {
      trade_id: tradeId,
      created_at: Date.now(),
      expected_profit: expectedProfit,
      buy_order: buy,
      sell_order: sell
    });

    console.log(`📤 Demo BUY ${size} @ $${buy.price.toFixed(4)} (${buy.order_id})`);
    console.log(`📤 Demo SELL ${size} @ $${sell.price.toFixed(4)} (${sell.order_id})`);

    return { buy_order_id: buy.order_id, sell_order_id: sell.order_id };
  }

  async cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean> {
    this.settleExpiredTrades();

    const existing = this.activeOrders.get(order_id);
    if (!existing) {
      return false;
    }

    this.activeOrders.delete(order_id);
    this.metrics.recordSettlement({
      order_id: existing.order_id,
      side: existing.side,
      price: existing.price,
      size: existing.size,
      status: 'CANCELLED'
    });

    const replacement = this.createOrder(existing.side, new_price, new_size);
    this.metrics.recordReplacement(order_id, replacement.order_id);
    console.log(`♻️ Replaced ${order_id} -> ${replacement.order_id}`);
    return true;
  }

  async cancelOrder(order_id: string): Promise<boolean> {
    this.settleExpiredTrades();
    const existing = this.activeOrders.get(order_id);
    if (!existing) {
      return false;
    }

    this.activeOrders.delete(order_id);
    this.metrics.recordSettlement({
      order_id: existing.order_id,
      side: existing.side,
      price: existing.price,
      size: existing.size,
      status: 'CANCELLED'
    });
    console.log(`✅ Demo cancelled order: ${order_id}`);
    return true;
  }

  getActiveOrders(): ActiveOrder[] {
    this.settleExpiredTrades();
    return Array.from(this.activeOrders.values());
  }

  private createOrder(side: 'BUY' | 'SELL', price: number, size: number): ActiveOrder {
    const order: ActiveOrder = {
      order_id: `demo-${side.toLowerCase()}-${randomBytes(3).toString('hex')}`,
      side,
      price,
      size,
      timestamp: Date.now(),
      status: 'PENDING'
    };

    this.activeOrders.set(order.order_id, order);
    return order;
  }

  private settleExpiredTrades() {
    const now = Date.now();

    for (const trade of this.tradeGroups.values()) {
      if (now - trade.created_at < this.maxOrderAgeMs) {
        continue;
      }

      this.tradeGroups.delete(trade.trade_id);

      const roll = Math.random();
      let outcome: 'WON' | 'LOST' | 'BREAKEVEN';
      let realizedPnl: number;
      let buyStatus: 'FILLED' | 'CANCELLED';
      let sellStatus: 'FILLED' | 'CANCELLED';

      if (roll < 0.58) {
        outcome = 'WON';
        realizedPnl = trade.expected_profit * (1.8 + Math.random() * 1.2);
        buyStatus = 'FILLED';
        sellStatus = 'FILLED';
      } else if (roll < 0.82) {
        outcome = 'BREAKEVEN';
        realizedPnl = trade.expected_profit * (Math.random() * 0.16 - 0.08);
        buyStatus = Math.random() > 0.5 ? 'FILLED' : 'CANCELLED';
        sellStatus = buyStatus === 'FILLED' ? 'CANCELLED' : 'FILLED';
      } else {
        outcome = 'LOST';
        realizedPnl = -trade.expected_profit * (0.55 + Math.random() * 0.9);
        buyStatus = Math.random() > 0.4 ? 'FILLED' : 'CANCELLED';
        sellStatus = buyStatus === 'FILLED' ? 'CANCELLED' : 'FILLED';
      }

      this.activeOrders.delete(trade.buy_order.order_id);
      this.activeOrders.delete(trade.sell_order.order_id);

      this.metrics.recordSettlement({
        order_id: trade.buy_order.order_id,
        side: trade.buy_order.side,
        price: trade.buy_order.price,
        size: trade.buy_order.size,
        status: buyStatus
      });
      this.metrics.recordSettlement({
        order_id: trade.sell_order.order_id,
        side: trade.sell_order.side,
        price: trade.sell_order.price,
        size: trade.sell_order.size,
        status: sellStatus
      });

      this.metrics.recordTradeResolution({
        trade_id: trade.trade_id,
        status: outcome,
        realized_pnl: Number(realizedPnl.toFixed(4)),
        filled_orders: [buyStatus, sellStatus].filter((status) => status === 'FILLED').length,
        cancelled_orders: [buyStatus, sellStatus].filter((status) => status === 'CANCELLED').length
      });
    }
  }
}

export function createDemoBot(metrics: DashboardMetricsStore): BTC5MinBot {
  process.env.DEMO_MODE = 'true';

  return new BTC5MinBot(
    process.env.MARKET_ID || 'demo-btc-5m',
    '0x' + randomBytes(32).toString('hex'),
    {
      listener: new DemoMarketListener(),
      placer: new DemoOrderPlacer(metrics),
      secondsIntoCandle: (() => {
        const sequence = [230, 245, 256, 265, 275, 285, 290, 296, 5, 45, 120, 180];
        let index = 0;

        return () => {
          const value = sequence[index % sequence.length];
          index++;
          return value;
        };
      })(),
      onCycle: (report) => {
        metrics.recordCycle(report);
      }
    }
  );
}
