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
    cancelOrder(order_id: string): Promise<boolean>;
    getActiveOrders(): ActiveOrder[];
}
type OrderSide = 'BUY' | 'SELL';
export declare class OrderPlacer implements OrderExecutor {
    private market_id;
    private client?;
    private signer;
    private readonly active_orders;
    private readonly demoMode;
    private readonly liveConfig?;
    private credsPromise?;
    constructor(market_id: string, private_key: string);
    private resolveChainId;
    private getClient;
    private buildDemoOrderId;
    private trackOrder;
    placeOrder(side: OrderSide, price: number, size: number, timeout_seconds?: number): Promise<string | null>;
    cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean>;
    cancelOrder(order_id: string): Promise<boolean>;
    placeBothSides(mid_price: number, spread_bps: number, size: number): Promise<{
        buy_order_id?: string;
        sell_order_id?: string;
    }>;
    getActiveOrders(): ActiveOrder[];
    getOrderStatus(order_id: string): ActiveOrder | undefined;
}
export {};
//# sourceMappingURL=order-placer.d.ts.map