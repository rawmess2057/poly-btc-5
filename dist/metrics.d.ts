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
}
export interface OrderSettlement {
    order_id: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    status: 'FILLED' | 'CANCELLED';
    profit_delta?: number;
}
export interface TradeResolution {
    trade_id: string;
    status: 'WON' | 'LOST' | 'BREAKEVEN';
    realized_pnl: number;
    filled_orders: number;
    cancelled_orders: number;
}
export declare class DashboardMetricsStore {
    private readonly startedAt;
    private lastUpdatedAt;
    private cycles;
    private edgeSignals;
    private skippedSignals;
    private tradesEntered;
    private ordersPlaced;
    private fills;
    private cancels;
    private replacements;
    private totalProfit;
    private realizedPnl;
    private wonTrades;
    private lostTrades;
    private breakevenTrades;
    private grossProfit;
    private grossLoss;
    private lastMidPrice;
    private lastRiskFreeProfit;
    private activeOrders;
    private peakActiveOrders;
    private criticalWindowCycles;
    private recentTrades;
    private recentEvents;
    private profitSeries;
    private readonly pendingTrades;
    private readonly orderToTrade;
    recordCycle(report: BotCycleReport): void;
    recordSettlement(settlement: OrderSettlement): void;
    recordTradeResolution(resolution: TradeResolution): void;
    recordReplacement(oldOrderId: string, newOrderId: string): void;
    getSnapshot(): {
        started_at: number;
        last_updated_at: number;
        runtime_ms: number;
        cycles: number;
        edge_signals: number;
        skipped_signals: number;
        trades_entered: number;
        orders_placed: number;
        fills: number;
        cancels: number;
        replacements: number;
        total_profit: number;
        realized_pnl: number;
        expected_value_open: number;
        won_trades: number;
        lost_trades: number;
        breakeven_trades: number;
        gross_profit: number;
        gross_loss: number;
        avg_win: number;
        avg_loss: number;
        profit_factor: number;
        last_mid_price: number;
        last_risk_free_profit: number;
        active_orders: number;
        peak_active_orders: number;
        critical_window_cycles: number;
        trades_per_hour: number;
        profit_per_hour: number;
        projected_day_profit: number;
        fill_rate: number;
        recent_trades: DashboardTrade[];
        recent_events: DashboardEvent[];
        profit_series: ProfitPoint[];
    };
    private pushEvent;
}
//# sourceMappingURL=metrics.d.ts.map