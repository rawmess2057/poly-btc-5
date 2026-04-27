import { MarketListener } from './market-listener';
import { OrderPlacer } from './order-placer';
import { BinanceOracle } from './binance-oracle';
import axios from 'axios';

import { CompoundingManager } from './compounding-manager';

export interface ActiveOrder {
  order_id: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
}

export interface OrderExecutor {
  placeBothSides(
    mid_price: number,
    spread_bps: number,
    size: number
  ): Promise<{ buy_order_id?: string; sell_order_id?: string }>;
  cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean>;
  cancelOrder(order_id: string): Promise<boolean>;
  getActiveOrders(): ActiveOrder[];
}

interface BotState {
  cycle: number;
  total_profit: number;
  last_order_ids: string[];
  in_critical_window: boolean;
  cycle_start_time: number;
  timeOffsetMs: number;
}

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
  best_bid: { price: number; size: number };
  best_ask: { price: number; size: number };
  all_bids: Array<{ price: number; size: number }>;
  all_asks: Array<{ price: number; size: number }>;
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

export class BTC5MinBot {
  private listener: MarketDataSource;
  private placer: OrderExecutor;
  private options: BotDependencies;
  private secondsIntoCandleProvider?: () => number;
  private onCycle?: (report: BotCycleReport) => void;
  private state: BotState = {
    cycle: 0,
    total_profit: 0,
    last_order_ids: [],
    in_critical_window: false,
    cycle_start_time: Date.now(),
    timeOffsetMs: 0
  };

  // ===== COMPOUNDING INTEGRATION =====
  private compoundingManager: CompoundingManager;
  private lastDailyResetTime: number = Date.now();

  private config = {
    market_id: '', // Set in constructor
    capital_usdc: parseFloat(process.env.INITIAL_CAPITAL_USDC || '500'),
    spread_bps: parseFloat(process.env.SPREAD_BPS || '20'),
    spread_bps_medium_edge: parseFloat(process.env.SPREAD_BPS_MEDIUM_EDGE || '24'),
    spread_bps_high_edge: parseFloat(process.env.SPREAD_BPS_HIGH_EDGE || '30'),
    target_window_start: parseFloat(process.env.TARGET_WINDOW_START || '25'),
    target_window_end: parseFloat(process.env.TARGET_WINDOW_END || '71'),
    order_size: parseFloat(process.env.BASE_ORDER_SIZE || '10'),
    order_size_medium_edge: parseFloat(process.env.MEDIUM_EDGE_ORDER_SIZE || '15'),
    order_size_high_edge: parseFloat(process.env.HIGH_EDGE_ORDER_SIZE || '20'),
    min_edge_to_trade: parseFloat(process.env.MIN_EDGE_TO_TRADE || '0.03'),
    medium_edge_threshold: parseFloat(process.env.MEDIUM_EDGE_THRESHOLD || '0.05'),
    high_edge_threshold: parseFloat(process.env.HIGH_EDGE_THRESHOLD || '0.07'),
    maker_rebate_bps: parseFloat(process.env.MAKER_REBATE_BPS || '0'),
    max_daily_drawdown_pct: parseFloat(process.env.MAX_DAILY_DRAWDOWN_PCT || '8'),
    polling_interval_ms: 500
  };

  private isRunning = false;
  private oracle?: BinanceOracle;

  private selectTradeParameters(riskFreeProfit: number) {
    if (riskFreeProfit >= this.config.high_edge_threshold) {
      return {
        order_size: this.config.order_size_high_edge,
        spread_bps: this.config.spread_bps_high_edge,
        edge_bucket: 'HIGH'
      } as const;
    }

    if (riskFreeProfit >= this.config.medium_edge_threshold) {
      return {
        order_size: this.config.order_size_medium_edge,
        spread_bps: this.config.spread_bps_medium_edge,
        edge_bucket: 'MEDIUM'
      } as const;
    }

    return {
      order_size: this.config.order_size,
      spread_bps: this.config.spread_bps,
      edge_bucket: 'BASE'
    } as const;
  }

  constructor(market_id: string, private_key: string, deps: BotDependencies = {}) {
    this.config.market_id = market_id;
    this.options = deps;
    this.listener = deps.listener ?? new MarketListener(market_id, process.env.WS_URL!);
    this.placer = deps.placer ?? new OrderPlacer(market_id, private_key);
    this.secondsIntoCandleProvider = deps.secondsIntoCandle;
    this.onCycle = deps.onCycle;

    // ===== INITIALIZE COMPOUNDING =====
    this.compoundingManager = new CompoundingManager(this.config.capital_usdc);
    console.log('💰 Compounding manager initialized');
    if (process.env.COMPOUNDING_ENABLED === 'true') {
      console.log(`   Strategy: ${process.env.COMPOUNDING_STRATEGY || 'tiered'}`);
      console.log(`   Tier 1 target: $${process.env.TIER1_CAPITAL_TARGET || '5000'}`);
      console.log(`   Tier 2 target: $${process.env.TIER2_CAPITAL_TARGET || '25000'}`);
    }
  }

  /**
   * Calculate seconds into current 5-minute candle
   * Assumes candles close at :00, :05, :10, etc.
   */
  private getSecondsIntoCandle(): number {
    if (this.secondsIntoCandleProvider) {
      return this.secondsIntoCandleProvider();
    }

    const now = new Date(Date.now() + this.state.timeOffsetMs);
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    const minutesIntoCandle = minutes % 5;
    const total_seconds = (minutesIntoCandle * 60) + seconds + (milliseconds / 1000);

    return total_seconds;
  }

  private async syncClock() {
    try {
      const start = Date.now();
      // Fetch precise time from a public time API
      const res = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', { timeout: 5000 });
      const end = Date.now();

      const serverTime = new Date(res.data.utc_datetime).getTime();
      const networkLatency = (end - start) / 2;

      this.state.timeOffsetMs = (serverTime + networkLatency) - end;
      console.log(`⏱️ Clock synced successfully. Local offset is ${this.state.timeOffsetMs}ms`);
    } catch (e: any) {
      console.warn(`⚠️ Could not sync clock. Using local time. Error: ${e.message}`);
    }
  }

  /**
   * Process profit with compounding
   * Call after each cycle to apply compounding logic
   */
  private processCompoundingCycle(cycleProfit: number): {
    reinvested: number;
    withdrawn: number;
    newCapital: number;
    rebalanceNeeded: boolean;
    circuitBreakerTriggered: boolean;
  } {
    const result = this.compoundingManager.processTrade(cycleProfit);

    // Log withdrawals
    if (result.withdrawn > 0) {
      console.log(`💰 Withdrawn: $${result.withdrawn.toFixed(2)}`);
    }

    // Handle circuit breaker
    if (result.circuitBreakerTriggered) {
      console.error('🛑 CIRCUIT BREAKER: Daily loss threshold exceeded. STOPPING TRADING.');
      return result;
    }

    // Update order size if capital changed significantly
    if (result.rebalanceNeeded) {
      const oldOrderSize = this.config.order_size;
      const newOrderSize = this.compoundingManager.getOrderSize(
        parseFloat(process.env.BASE_ORDER_SIZE || '10')
      );

      if (newOrderSize !== oldOrderSize) {
        console.log(`🔄 Rebalancing order size: ${oldOrderSize} → ${newOrderSize} contracts`);
        this.config.order_size = newOrderSize;
        
        // Also scale medium/high edge order sizes proportionally
        const scaleFactor = newOrderSize / oldOrderSize;
        this.config.order_size_medium_edge *= scaleFactor;
        this.config.order_size_high_edge *= scaleFactor;
      }
    }

    // Update capital in config
    this.config.capital_usdc = result.newCapital;

    return result;
  }

  /**
   * Reset daily metrics and print report (call at midnight)
   */
  private resetDailyMetrics(): void {
    const stats = this.compoundingManager.getDailyStats();
    console.log(`
╔════════════════════════════════════════╗
║        DAILY RESET & COMPOUNDING       ║
╚════════════════════════════════════════╝
Daily Profit:  $${stats.dailyProfit.toFixed(2)}
Daily Return:  ${stats.dailyReturn.toFixed(2)}%
Capital:       $${stats.capital.toFixed(2)}
Tier:          ${stats.tier}
Total Withdrawn: $${stats.withdrawn.toFixed(2)}
    `);

    this.compoundingManager.resetDaily();
  }

  /**
   * Print full compounding report
   */
  printCompoundingReport(): void {
    console.log(this.compoundingManager.getReport());
  }

  /**
   * Main loop: Check for edges and execute
   */
  async start() {
    await this.syncClock();

    // Resync every hour
    setInterval(() => this.syncClock(), 60 * 60 * 1000);

    // Daily reset at midnight
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        // Make sure we only run once per day
        const daysSinceLastReset = (Date.now() - this.lastDailyResetTime) / (1000 * 60 * 60 * 24);
        if (daysSinceLastReset > 0.99) {
          this.resetDailyMetrics();
          this.lastDailyResetTime = Date.now();
        }
      }
    }, 60000); // Check every minute

    const strikePrice = parseFloat(process.env.STRIKE_PRICE || '0');
    if (strikePrice > 0) {
      this.oracle = new BinanceOracle(strikePrice, (price, direction) => {
        const msg = `🚨 ORACLE PANIC CANCEL: BTC crossed ${direction} through strike $${strikePrice.toLocaleString()} at $${price.toLocaleString()}`;
        console.error(msg);
        this.options.onEvent?.('warn', msg);
        this.panicCancel(msg);
      });
      this.oracle.start();
    }

    this.isRunning = true;
    console.log('🚀 BTC 5-Minute Bot starting...');
    console.log(`   Market ID: ${this.config.market_id}`);
    console.log(`   Capital: $${this.config.capital_usdc}`);
    console.log(`   Spread: ${this.config.spread_bps} bps`);
    console.log(`   Critical window: ${this.config.target_window_start}s - ${this.config.target_window_end}s`);
    console.log(`   Compounding: ${process.env.COMPOUNDING_ENABLED === 'true' ? '✅ ENABLED' : '❌ DISABLED'}\n`);

    // Main loop
    const interval = setInterval(() => this.cycle(), this.config.polling_interval_ms);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down gracefully...');
      clearInterval(interval);
      this.listener.close();
      this.printCompoundingReport();
      process.exit(0);
    });
  }

  async runFor(duration_ms: number) {
    console.log(`🧪 Running bot for ${(duration_ms / 1000).toFixed(1)}s`);

    const interval = setInterval(() => {
      void this.cycle();
    }, this.config.polling_interval_ms);

    await new Promise((resolve) => setTimeout(resolve, duration_ms));

    clearInterval(interval);
    this.listener.close();
    console.log('\n--- Running compounding report ---');
    this.printCompoundingReport();
  }

  private async panicCancel(reason: string) {
    const active = this.placer.getActiveOrders();
    let cancelledCount = 0;
    for (const order of active) {
      if (order.status === 'PENDING') {
        const success = await this.placer.cancelOrder(order.order_id);
        if (success) cancelledCount++;
      }
    }
    if (cancelledCount > 0) {
      const msg = `✅ Panic cancelled ${cancelledCount} orders due to: ${reason}`;
      console.log(msg);
      this.options.onEvent?.('cancel', msg);
    }
    // Pause trading for the rest of this candle to be safe
    this.state.in_critical_window = false;
  }

  private async cycle() {
    // ========== DRAWDOWN CHECK ==========
    const max_loss_amount = this.config.capital_usdc * (this.config.max_daily_drawdown_pct / 100);
    if (this.state.total_profit <= -max_loss_amount) {
      console.error(`\n🚨 FATAL: Max daily drawdown of ${this.config.max_daily_drawdown_pct}% ($${max_loss_amount.toFixed(2)}) reached!`);
      console.error(`🚨 Current PnL: $${this.state.total_profit.toFixed(2)}`);
      console.error(`🚨 Cancelling all active orders and shutting down to protect capital.`);
      
      const active = this.placer.getActiveOrders();
      for (const order of active) {
        if (order.status === 'PENDING') {
          await this.placer.cancelOrder(order.order_id);
        }
      }
      
      this.listener.close();
      this.printCompoundingReport();
      console.log('🛑 Bot stopped.');
      process.exit(1);
    }

    const snapshot = this.listener.getSnapshot();
    const seconds_in_candle = this.getSecondsIntoCandle();
    let enteredTrade = false;
    let estimatedCycleProfit = 0;
    let riskFreeProfit = 0;
    let selectedOrderSize = 0;
    let selectedSpreadBps = 0;
    this.state.last_order_ids = [];

    // Check if we're in the critical T-10s window
    const is_critical =
      seconds_in_candle >= this.config.target_window_start &&
      seconds_in_candle <= this.config.target_window_end;

    this.state.in_critical_window = is_critical;

    // ========== EDGE DETECTION: Sum < $1 ==========
    const edgeDetected = snapshot.sum_check < 0.98;
    if (edgeDetected) {
      riskFreeProfit = Number((0.98 - snapshot.sum_check).toFixed(4));
      console.log(`\n🎯 EDGE DETECTED at ${seconds_in_candle.toFixed(1)}s into candle`);
      console.log(`   Sum: ${snapshot.sum_check.toFixed(4)} (should be ~1.00)`);
      console.log(`   Risk-free profit: $${riskFreeProfit.toFixed(4)}`);

      // Only enter during critical window
      if (is_critical) {
        if (riskFreeProfit < this.config.min_edge_to_trade) {
          console.log(`   ⏭️ Edge below minimum trade threshold of $${this.config.min_edge_to_trade.toFixed(4)}`);
        } else {
          const parameters = this.selectTradeParameters(riskFreeProfit);
          selectedOrderSize = parameters.order_size;
          selectedSpreadBps = parameters.spread_bps;
          console.log(`   ✅ IN CRITICAL WINDOW - ENTERING ${parameters.edge_bucket} EDGE TRADE`);
          console.log(`   Size: ${selectedOrderSize} | Spread: ${selectedSpreadBps} bps`);
          estimatedCycleProfit = await this.enterTrade(snapshot, selectedSpreadBps, selectedOrderSize);
          enteredTrade = estimatedCycleProfit > 0;

          // ===== PROCESS COMPOUNDING =====
          if (estimatedCycleProfit > 0) {
            const compoundingResult = this.processCompoundingCycle(estimatedCycleProfit);
            
            if (compoundingResult.circuitBreakerTriggered) {
              // Stop the bot
              this.listener.close();
              process.exit(1);
            }

            if (compoundingResult.reinvested > 0) {
              console.log(`💹 Compounding: Reinvested $${compoundingResult.reinvested.toFixed(2)} | Withdrawn $${compoundingResult.withdrawn.toFixed(2)}`);
            }
          }
        }
      } else {
        console.log(`   ⏳ Outside critical window. Wait for ${this.config.target_window_start}s-${this.config.target_window_end}s`);
      }
    }

    // ========== MAKER ORDER MANAGEMENT ==========
    const active = this.placer.getActiveOrders();

    if (active.length > 0 && is_critical) {
      // In critical window: check if we need to rebalance
      const bid_price = snapshot.best_bid.price;
      const ask_price = snapshot.best_ask.price;

      // If market moved significantly, cancel and replace
      const spread_moved = Math.abs(snapshot.mid_price - (bid_price + ask_price) / 2) > 0.01;

      if (spread_moved && active.length > 0) {
        console.log(`\n⚡ Market moved! Rebalancing orders...`);
        for (const order of active) {
          if (order.status === 'PENDING') {
            await this.placer.cancelAndReplace(
              order.order_id,
              order.side === 'BUY' ? snapshot.mid_price - 0.01 : snapshot.mid_price + 0.01,
              order.size
            );
          }
        }
      }
    }

    // ========== LOGGING ==========
    if (this.state.cycle % 20 === 0) {
      const compoundingStats = this.compoundingManager.getDailyStats();
      console.log(`\n📊 Status (cycle ${this.state.cycle}):`);
      console.log(`   Mid price: $${snapshot.mid_price.toFixed(4)}`);
      console.log(`   Time in candle: ${seconds_in_candle.toFixed(1)}s`);
      console.log(`   Critical window: ${is_critical ? '✅ YES' : '❌ NO'}`);
      console.log(`   Active orders: ${active.length}`);
      console.log(`   Profit (session): $${this.state.total_profit.toFixed(2)}`);
      console.log(`   Capital (compounded): $${compoundingStats.capital.toFixed(2)}`);
      console.log(`   Tier: ${compoundingStats.tier}`);
    }

    this.onCycle?.({
      cycle: this.state.cycle,
      timestamp: Date.now(),
      market_id: this.config.market_id,
      mid_price: snapshot.mid_price,
      seconds_in_candle,
      active_orders: active.length,
      in_critical_window: is_critical,
      total_profit: this.state.total_profit,
      capital: this.config.capital_usdc,
      edge_detected: edgeDetected,
      risk_free_profit: riskFreeProfit,
      entered_trade: enteredTrade,
      estimated_cycle_profit: estimatedCycleProfit,
      selected_order_size: selectedOrderSize,
      selected_spread_bps: selectedSpreadBps,
      order_ids: this.state.last_order_ids,
      snapshot
    });

    this.state.cycle++;
  }

  private async enterTrade(snapshot: MarketSnapshot, spreadBps: number, orderSize: number): Promise<number> {
    // Place both sides of the market
    const result = await this.placer.placeBothSides(
      snapshot.mid_price,
      spreadBps,
      orderSize
    );

    this.state.last_order_ids = [result.buy_order_id, result.sell_order_id].filter(Boolean) as string[];

    // Estimate profit if both fill
    const spread_profit = (spreadBps / 10000) * orderSize * 2 * snapshot.mid_price;
    const rebate_profit = (this.config.maker_rebate_bps / 10000) * orderSize * 2 * snapshot.mid_price;

    const cycle_profit = spread_profit + rebate_profit;
    this.state.total_profit += cycle_profit;

    console.log(`   Estimated cycle profit: $${cycle_profit.toFixed(4)}`);
    return cycle_profit;
  }
}