"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderPlacer = void 0;
const clob_client_1 = require("@polymarket/clob-client");
const ethers_1 = require("ethers");
class OrderPlacer {
    constructor(market_id, private_key) {
        this.market_id = market_id;
        this.active_orders = new Map();
        this.signer = new ethers_1.ethers.Wallet(private_key);
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
    resolveChainId(raw) {
        if (raw === '80002') {
            return clob_client_1.Chain.AMOY;
        }
        return clob_client_1.Chain.POLYGON;
    }
    async getClient() {
        if (this.demoMode) {
            return undefined;
        }
        if (!this.liveConfig) {
            throw new Error('Missing TOKEN_ID for live trading. Set TOKEN_ID in .env.');
        }
        if (!this.credsPromise) {
            const bootstrapClient = new clob_client_1.ClobClient(this.liveConfig.host, this.liveConfig.chainId, this.signer);
            this.credsPromise = bootstrapClient.createOrDeriveApiKey();
        }
        if (!this.client) {
            const creds = await this.credsPromise;
            this.client = new clob_client_1.ClobClient(this.liveConfig.host, this.liveConfig.chainId, this.signer, creds, this.liveConfig.signatureType, this.liveConfig.funderAddress);
        }
        return this.client;
    }
    buildDemoOrderId(side) {
        return `demo-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    trackOrder(order_id, side, price, size) {
        this.active_orders.set(order_id, {
            order_id,
            side,
            price,
            size,
            timestamp: Date.now(),
            status: 'PENDING'
        });
    }
    async placeOrder(side, price, size, timeout_seconds = 60) {
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
            const tickSize = (process.env.TICK_SIZE || '0.01');
            const order = await client.createAndPostOrder({
                tokenID: this.liveConfig.tokenId,
                price,
                side: side === 'BUY' ? clob_client_1.Side.BUY : clob_client_1.Side.SELL,
                size,
                feeRateBps: 0,
                expiration: Math.floor(Date.now() / 1000) + timeout_seconds
            }, {
                tickSize,
                negRisk: process.env.NEG_RISK === 'true'
            }, clob_client_1.OrderType.GTD);
            const orderId = order?.orderID || order?.id || order?.orderId;
            if (!orderId) {
                console.error('Order rejected:', order);
                return null;
            }
            this.trackOrder(orderId, side, price, size);
            console.log(`✅ Order placed: ${orderId}`);
            return orderId;
        }
        catch (err) {
            console.error('Order placement error:', err);
            return null;
        }
    }
    async cancelAndReplace(order_id, new_price, new_size) {
        try {
            const existing = this.active_orders.get(order_id);
            if (!existing) {
                console.warn(`Order ${order_id} is not tracked locally; skipping replace.`);
                return false;
            }
            const start = Date.now();
            if (this.demoMode) {
                this.active_orders.delete(order_id);
            }
            else {
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
        }
        catch (err) {
            console.error('Cancel/replace failed:', err);
            return false;
        }
    }
    async placeBothSides(mid_price, spread_bps, size) {
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
    getActiveOrders() {
        return Array.from(this.active_orders.values());
    }
    getOrderStatus(order_id) {
        return this.active_orders.get(order_id);
    }
}
exports.OrderPlacer = OrderPlacer;
//# sourceMappingURL=order-placer.js.map