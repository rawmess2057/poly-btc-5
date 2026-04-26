export interface BotCycleReport {
    cycle: number;
    timestamp: number;
    market_id: string;
    mid_price: number;
    seconds_in_candle: number;
    active_orders: number;
    in_critical_window: boolean;
    total_profit: number;
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
export interface ActiveOrder {
    order_id: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    timestamp: number;
    status: 'PENDING' | 'FILLED' | 'CANCELLED';
}
export interface OrderExecutor {
    placeBothSides(mid_price: number, spread_bps: number, size: number): Promise<{
        buy_order_id?: string;
        sell_order_id?: string;
    }>;
    cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean>;
    getActiveOrders(): ActiveOrder[];
}
interface BotDependencies {
    listener?: MarketDataSource;
    placer?: OrderExecutor;
    secondsIntoCandle?: () => number;
    onCycle?: (report: BotCycleReport) => void;
}
export declare class BTC5MinBot {
    private listener;
    private placer;
    private secondsIntoCandleProvider?;
    private onCycle?;
    private state;
    private config;
    private selectTradeParameters;
    constructor(market_id: string, private_key: string, deps?: BotDependencies);
    /**
     * Calculate seconds into current 5-minute candle
     * Assumes candles close at :00, :05, :10, etc.
     */
    private getSecondsIntoCandle;
    /**
     * Main loop: Check for edges and execute
     */
    start(): Promise<void>;
    runFor(duration_ms: number): Promise<void>;
    private cycle;
    private enterTrade;
}
export {};
//# sourceMappingURL=btc-bot.d.ts.map