import type { BotCycleReport } from './btc-bot';

export interface DashboardTrade {
  timestamp: number;
  cycle: number;
  mid_price: number;
  risk_free_profit: number;
  estimated_cycle_profit: number;
  order_ids: string[];
  trade_id: string;
  status: 'OPEN' | 'WON' | 'LOST' | 'BREAKEVEN';
  realized_pnl?: number;
}

export interface DashboardEvent {
  timestamp: number;
  level: 'info' | 'trade' | 'fill' | 'cancel';
  message: string;
}

export interface ProfitPoint {
  timestamp: number;
  total_profit: number;
  cycle: number;
  balance: number;
}

export interface OrderSettlement {
  order_id: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  status: 'FILLED' | 'CANCELLED';
  profit_delta?: number;
}

interface PendingTrade {
  trade_id: string;
  timestamp: number;
  cycle: number;
  mid_price: number;
  risk_free_profit: number;
  estimated_cycle_profit: number;
  order_ids: string[];
}

export interface TradeResolution {
  trade_id: string;
  status: 'WON' | 'LOST' | 'BREAKEVEN';
  realized_pnl: number;
  filled_orders: number;
  cancelled_orders: number;
}

export class DashboardMetricsStore {
  private readonly startedAt = Date.now();
  private lastUpdatedAt = this.startedAt;
  private cycles = 0;
  private edgeSignals = 0;
  private skippedSignals = 0;
  private tradesEntered = 0;
  private ordersPlaced = 0;
  private fills = 0;
  private cancels = 0;
  private replacements = 0;
  private totalProfit = 0;
  private capital = 0;
  private realizedPnl = 0;
  private wonTrades = 0;
  private lostTrades = 0;
  private breakevenTrades = 0;
  private grossProfit = 0;
  private grossLoss = 0;
  private lastMidPrice = 0;
  private lastRiskFreeProfit = 0;
  private activeOrders = 0;
  private peakActiveOrders = 0;
  private criticalWindowCycles = 0;
  private recentTrades: DashboardTrade[] = [];
  private recentEvents: DashboardEvent[] = [];
  private profitSeries: ProfitPoint[] = [];
  private readonly pendingTrades = new Map<string, PendingTrade>();
  private readonly orderToTrade = new Map<string, string>();

  recordCycle(report: BotCycleReport) {
    this.lastUpdatedAt = report.timestamp;
    this.cycles = report.cycle + 1;
    this.totalProfit = report.total_profit;
    this.capital = report.capital;
    this.lastMidPrice = report.mid_price;
    this.lastRiskFreeProfit = report.risk_free_profit;
    this.activeOrders = report.active_orders;
    this.peakActiveOrders = Math.max(this.peakActiveOrders, report.active_orders);

    if (report.in_critical_window) {
      this.criticalWindowCycles++;
    }

    if (report.edge_detected) {
      this.edgeSignals++;
      this.pushEvent('info', `Edge signal at ${report.seconds_in_candle.toFixed(1)}s with $${report.risk_free_profit.toFixed(4)} spread`);
    }

    if (report.edge_detected && !report.entered_trade) {
      this.skippedSignals++;
    }

    if (report.entered_trade) {
      this.tradesEntered++;
      this.ordersPlaced += report.order_ids.length;
      const tradeId = `pair:${report.order_ids.join(':')}`;
      const trade: DashboardTrade = {
        timestamp: report.timestamp,
        cycle: report.cycle,
        mid_price: report.mid_price,
        risk_free_profit: report.risk_free_profit,
        estimated_cycle_profit: report.estimated_cycle_profit,
        order_ids: report.order_ids,
        trade_id: tradeId,
        status: 'OPEN'
      };

      this.pendingTrades.set(tradeId, {
        trade_id: tradeId,
        timestamp: report.timestamp,
        cycle: report.cycle,
        mid_price: report.mid_price,
        risk_free_profit: report.risk_free_profit,
        estimated_cycle_profit: report.estimated_cycle_profit,
        order_ids: report.order_ids
      });

      for (const orderId of report.order_ids) {
        this.orderToTrade.set(orderId, tradeId);
      }

      this.recentTrades.unshift({
        ...trade
      });
      this.recentTrades = this.recentTrades.slice(0, 20);
      this.pushEvent('trade', `Entered paired trade at $${report.mid_price.toFixed(4)} for est. $${report.estimated_cycle_profit.toFixed(4)}`);
    }

    const lastPoint = this.profitSeries[this.profitSeries.length - 1];
    const shouldPush = !lastPoint || 
                       (report.total_profit !== lastPoint.total_profit) || 
                       (report.timestamp - lastPoint.timestamp >= 15000);

    if (shouldPush) {
      this.profitSeries.push({
        timestamp: report.timestamp,
        total_profit: report.total_profit,
        cycle: report.cycle,
        balance: this.capital + report.total_profit
      });
      
      if (this.profitSeries.length > 5000) {
        this.profitSeries.shift();
      }
    }
  }

  recordSettlement(settlement: OrderSettlement) {
    this.lastUpdatedAt = Date.now();

    if (settlement.status === 'FILLED') {
      this.fills++;
      this.pushEvent(
        'fill',
        `Order ${settlement.order_id} filled ${settlement.side} ${settlement.size} @ $${settlement.price.toFixed(4)}`
      );
    } else {
      this.cancels++;
      this.pushEvent(
        'cancel',
        `Order ${settlement.order_id} cancelled ${settlement.side} ${settlement.size} @ $${settlement.price.toFixed(4)}`
      );
    }
  }

  recordTradeResolution(resolution: TradeResolution) {
    this.lastUpdatedAt = Date.now();
    this.realizedPnl += resolution.realized_pnl;

    if (resolution.realized_pnl > 0) {
      this.grossProfit += resolution.realized_pnl;
    } else if (resolution.realized_pnl < 0) {
      this.grossLoss += Math.abs(resolution.realized_pnl);
    }

    if (resolution.status === 'WON') {
      this.wonTrades++;
    } else if (resolution.status === 'LOST') {
      this.lostTrades++;
    } else {
      this.breakevenTrades++;
    }

    const pending = this.pendingTrades.get(resolution.trade_id);
    if (pending) {
      this.pendingTrades.delete(resolution.trade_id);
      for (const orderId of pending.order_ids) {
        this.orderToTrade.delete(orderId);
      }
    }

    this.recentTrades = this.recentTrades.map((trade) =>
      trade.trade_id === resolution.trade_id
        ? { ...trade, status: resolution.status, realized_pnl: Number(resolution.realized_pnl.toFixed(4)) }
        : trade
    );

    this.pushEvent(
      resolution.status === 'LOST' ? 'cancel' : 'fill',
      `Trade ${resolution.trade_id} ${resolution.status.toLowerCase()} at ${resolution.realized_pnl >= 0 ? '+' : ''}$${resolution.realized_pnl.toFixed(4)}`
    );
  }

  recordReplacement(oldOrderId: string, newOrderId: string) {
    this.lastUpdatedAt = Date.now();
    this.replacements++;
    this.pushEvent('info', `Replaced order ${oldOrderId} with ${newOrderId}`);
  }

  getSnapshot() {
    const runtimeMs = this.lastUpdatedAt - this.startedAt;
    const runtimeHours = runtimeMs / 3_600_000;
    const tradesPerHour = runtimeHours > 0 ? this.tradesEntered / runtimeHours : 0;
    const profitPerHour = runtimeHours > 0 ? this.totalProfit / runtimeHours : 0;
    const projectedDayProfit = profitPerHour * 24;
    const openExpectedValue = Array.from(this.pendingTrades.values()).reduce(
      (sum, trade) => sum + trade.estimated_cycle_profit,
      0
    );
    const avgWin = this.wonTrades > 0 ? this.grossProfit / this.wonTrades : 0;
    const avgLoss = this.lostTrades > 0 ? this.grossLoss / this.lostTrades : 0;
    const profitFactor = this.grossLoss > 0 ? this.grossProfit / this.grossLoss : (this.grossProfit > 0 ? this.grossProfit : 0);

    return {
      started_at: this.startedAt,
      last_updated_at: this.lastUpdatedAt,
      runtime_ms: runtimeMs,
      cycles: this.cycles,
      edge_signals: this.edgeSignals,
      skipped_signals: this.skippedSignals,
      trades_entered: this.tradesEntered,
      orders_placed: this.ordersPlaced,
      fills: this.fills,
      cancels: this.cancels,
      replacements: this.replacements,
      total_profit: Number(this.totalProfit.toFixed(4)),
      capital: Number(this.capital.toFixed(4)),
      balance: Number((this.capital + this.totalProfit).toFixed(4)),
      realized_pnl: Number(this.realizedPnl.toFixed(4)),
      expected_value_open: Number(openExpectedValue.toFixed(4)),
      won_trades: this.wonTrades,
      lost_trades: this.lostTrades,
      breakeven_trades: this.breakevenTrades,
      gross_profit: Number(this.grossProfit.toFixed(4)),
      gross_loss: Number(this.grossLoss.toFixed(4)),
      avg_win: Number(avgWin.toFixed(4)),
      avg_loss: Number(avgLoss.toFixed(4)),
      profit_factor: Number(profitFactor.toFixed(4)),
      last_mid_price: Number(this.lastMidPrice.toFixed(4)),
      last_risk_free_profit: Number(this.lastRiskFreeProfit.toFixed(4)),
      active_orders: this.activeOrders,
      peak_active_orders: this.peakActiveOrders,
      critical_window_cycles: this.criticalWindowCycles,
      trades_per_hour: Number(tradesPerHour.toFixed(2)),
      profit_per_hour: Number(profitPerHour.toFixed(4)),
      projected_day_profit: Number(projectedDayProfit.toFixed(4)),
      fill_rate: this.ordersPlaced > 0 ? Number(((this.fills / this.ordersPlaced) * 100).toFixed(1)) : 0,
      recent_trades: this.recentTrades,
      recent_events: this.recentEvents,
      profit_series: this.profitSeries
    };
  }

  pushEvent(level: DashboardEvent['level'] | 'warn', message: string) {
    this.recentEvents.unshift({
      timestamp: Date.now(),
      level: level === 'warn' ? 'cancel' : level, // Map warn to cancel for UI
      message
    });
    this.recentEvents = this.recentEvents.slice(0, 30);
  }
}
