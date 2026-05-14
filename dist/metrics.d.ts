import { BotCycleReport } from './btc-bot';
export interface MetricsSnapshot {
    cycle: number;
    timestamp: number;
    capital: number;
    daily_profit: number;
    daily_profit_pct: number;
    hourly_profit: number;
    total_profit: number;
    total_trades: number;
    won_trades: number;
    lost_trades: number;
    breakeven_trades: number;
    win_rate: number;
    profit_factor: number;
    avg_win: number;
    avg_loss: number;
    risk_reward_ratio: number;
    expected_value: number;
    max_drawdown: number;
    max_drawdown_pct: number;
    current_drawdown: number;
    current_drawdown_pct: number;
    fill_rate: number;
    trades_per_hour: number;
    runtime_ms: number;
    tier: number;
    scaling_multiplier: number;
    next_tier_target: number;
    tier_progress: number;
}
export declare class MetricsTracker {
    private startTime;
    private peakCapital;
    private snapshots;
    private trades;
    private hourlyProfits;
    private dailyStats;
    constructor();
    recordTrade(profit: number, timestamp: number, size?: number): void;
    recordOrderPlaced(count?: number): void;
    recordFill(count?: number): void;
    recordCancel(count?: number): void;
    snapshot(capital: number, cycle: number, tier: number, scalingMultiplier: number, nextTierTarget: number, tierProgress: number): MetricsSnapshot;
    getStats(): {
        total_trades: number;
        won_trades: number;
        lost_trades: number;
        breakeven_trades: number;
        total_profit: number;
        gross_profit: number;
        gross_loss: number;
        orders_placed: number;
        fills: number;
        cancels: number;
    };
    getSnapshots(): MetricsSnapshot[];
    resetDaily(): void;
    exportForDashboard(): {
        snapshots: MetricsSnapshot[];
        cycle: number;
        timestamp: number;
        capital: number;
        daily_profit: number;
        daily_profit_pct: number;
        hourly_profit: number;
        total_profit: number;
        total_trades: number;
        won_trades: number;
        lost_trades: number;
        breakeven_trades: number;
        win_rate: number;
        profit_factor: number;
        avg_win: number;
        avg_loss: number;
        risk_reward_ratio: number;
        expected_value: number;
        max_drawdown: number;
        max_drawdown_pct: number;
        current_drawdown: number;
        current_drawdown_pct: number;
        fill_rate: number;
        trades_per_hour: number;
        runtime_ms: number;
        tier: number;
        scaling_multiplier: number;
        next_tier_target: number;
        tier_progress: number;
        gross_profit: number;
        gross_loss: number;
        fills: number;
        cancels: number;
        orders_placed: number;
    };
    getReport(): string;
}
export interface SettlementRecord {
    order_id: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    status: 'FILLED' | 'CANCELLED';
}
export interface TradeResolution {
    trade_id: string;
    status: 'WON' | 'LOST' | 'BREAKEVEN';
    realized_pnl: number;
    filled_orders: number;
    cancelled_orders: number;
}
export declare class DashboardMetricsStore {
    private cycles;
    private trades;
    private settlements;
    private hourlyProfits;
    recordCycle(report: BotCycleReport): void;
    recordSettlement(settlement: SettlementRecord): void;
    recordTradeResolution(trade: TradeResolution): void;
    recordReplacement(oldId: string, newId: string): void;
    getMetrics(): {
        cycles: number;
        trades: number;
        won_trades: number;
        win_rate: number;
        daily_profit: number;
        hourly_profit: number;
        capital: number;
    };
}
//# sourceMappingURL=metrics.d.ts.map