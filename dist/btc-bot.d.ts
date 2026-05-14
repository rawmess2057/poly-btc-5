import { OrderExecutor } from './order-placer';
export { ActiveOrder, OrderExecutor } from './order-placer';
export interface BotCycleReport {
    cycle: number;
    timestamp: number;
    market_id: string;
    mid_price: number;
    seconds_in_candle: number;
    active_orders: number;
    in_critical_window: boolean;
    total_profit: number;
    capital: number;
    circuit_breaker_active: boolean;
    edge_detected: boolean;
    risk_free_profit: number;
    entered_trade: boolean;
    estimated_cycle_profit: number;
    selected_order_size: number;
    selected_spread_bps: number;
    order_ids: string[];
    snapshot: MarketSnapshot;
}
export interface MarketSnapshot {
    best_bid: {
        price: number;
        size: number;
    };
    best_ask: {
        price: number;
        size: number;
    };
    all_bids: Array<{
        price: number;
        size: number;
    }>;
    all_asks: Array<{
        price: number;
        size: number;
    }>;
    mid_price: number;
    timestamp: number;
    sum_check: number;
}
export interface MarketDataSource {
    getSnapshot(): MarketSnapshot;
    close(): void;
}
export interface BotDependencies {
    listener?: MarketDataSource;
    placer?: OrderExecutor;
    secondsIntoCandle?: () => number;
    onCycle?: (report: BotCycleReport) => void;
    onEvent?: (level: 'info' | 'trade' | 'fill' | 'cancel' | 'warn', message: string) => void;
}
export declare class BTC5MinBot {
    private listener;
    private placer;
    private options;
    private state;
    private compoundingManager;
    private circuitBreaker;
    private lastDailyResetTime;
    private config;
    constructor(market_id: string, private_key: string, deps?: BotDependencies);
    private getSecondsIntoCandle;
    private cycle;
    private enterTrade;
    start(): Promise<void>;
    runFor(duration_ms: number): Promise<void>;
}
//# sourceMappingURL=btc-bot.d.ts.map