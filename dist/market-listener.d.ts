import type { MarketDataSource, MarketSnapshot } from './btc-bot';
export declare class MarketListener implements MarketDataSource {
    private ws;
    private market_id;
    private snapshot;
    constructor(market_id: string, ws_url: string);
    private initializeConnection;
    private updateSnapshot;
    getSnapshot(): MarketSnapshot;
    reconnect(): void;
    close(): void;
}
//# sourceMappingURL=market-listener.d.ts.map