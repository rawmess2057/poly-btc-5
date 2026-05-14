// src/btc-bot.ts
import { MarketListener } from './market-listener';
import { OrderPlacer, ActiveOrder, OrderExecutor } from './order-placer';
import { CompoundingManager } from './compounding-manager';
import { CircuitBreaker } from './circuit-breaker';

export { ActiveOrder, OrderExecutor } from './order-placer';

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

  private state: BotState = {
    cycle: 0,
    total_profit: 0,
    last_order_ids: [],
    in_critical_window: false,
    cycle_start_time: Date.now(),
    timeOffsetMs: 0
  };

  private compoundingManager: CompoundingManager;
  private circuitBreaker: CircuitBreaker;
  private lastDailyResetTime: number = Date.now();

  private config = {
    market_id: '',
    capital_usdc: parseFloat(process.env.INITIAL_CAPITAL_USDC || '500'),
    spread_bps: parseFloat(process.env.SPREAD_BPS || '200'),
    target_window_start: parseFloat(process.env.TARGET_WINDOW_START || '25'),
    target_window_end: parseFloat(process.env.TARGET_WINDOW_END || '71'),
    order_size: parseFloat(process.env.BASE_ORDER_SIZE || '10'),
    min_edge_to_trade: parseFloat(process.env.MIN_EDGE_TO_TRADE || '0.03'),
    polling_interval_ms: 500,
    max_daily_drawdown_pct: parseFloat(process.env.MAX_DAILY_DRAWDOWN_PCT || '8'),
    fee_rate_bps: parseFloat(process.env.FEE_RATE_BPS || '100'), // 1% fee per side
  };

  constructor(market_id: string, private_key: string, deps: BotDependencies = {}) {
    this.config.market_id = market_id;
    this.options = deps;

    this.listener = deps.listener ?? new MarketListener(market_id, process.env.WS_URL!);
    this.placer = deps.placer ?? new OrderPlacer(market_id, private_key);

    // Override time function for testing (allows mocking time)
    if (deps.secondsIntoCandle) {
      this.getSecondsIntoCandle = deps.secondsIntoCandle;
    }

    this.compoundingManager = new CompoundingManager(this.config.capital_usdc);
    this.circuitBreaker = new CircuitBreaker(this.config.capital_usdc);

    console.log('🚀 BTC 5-Min Bot started');
    console.log(`💰 Initial Capital: $${this.config.capital_usdc}`);
    console.log(`📅 Compounding: Daily (at end of 24h)`);
  }

  private getSecondsIntoCandle(): number {
    if (this.options.secondsIntoCandle) return this.options.secondsIntoCandle();

    const now = new Date(Date.now() + this.state.timeOffsetMs);
    const minutesIntoCandle = now.getMinutes() % 5;
    return minutesIntoCandle * 60 + now.getSeconds() + (now.getMilliseconds() / 1000);
  }

  private async cycle() {
    // Check circuit breaker first
    if (this.circuitBreaker.isActive()) {
      console.error(`Circuit breaker active. Trading halted: ${this.circuitBreaker.getState().triggerReason}`);
      return;
    }

    // Daily reset check
    this.compoundingManager.processDailyReset();
    this.circuitBreaker.resetForNewDay();

    const snapshot = this.listener.getSnapshot();
    const seconds_in_candle = this.getSecondsIntoCandle();

    const is_critical = seconds_in_candle >= this.config.target_window_start &&
                        seconds_in_candle <= this.config.target_window_end;

    let enteredTrade = false;
    let estimatedCycleProfit = 0;
    let riskFreeProfit = 0;

    const edgeDetected = snapshot.sum_check < 0.98;
    
    // Debug: log when edge detected but not in critical window
    if (edgeDetected && !is_critical) {
      console.log(`⚠️  Edge detected but NOT in critical window: ${seconds_in_candle}s (need ${this.config.target_window_start}-${this.config.target_window_end}s)`);
    }
    
    // Debug: log when in critical window
    if (is_critical) {
      console.log(`✅ In critical window: ${seconds_in_candle}s (edge=${edgeDetected}, sum=${snapshot.sum_check.toFixed(4)})`);
    }

    if (edgeDetected) {
      riskFreeProfit = Number((0.98 - snapshot.sum_check).toFixed(4));

      if (is_critical && riskFreeProfit >= this.config.min_edge_to_trade) {
        // Use higher spread for better edge
        const spreadBps = riskFreeProfit > 0.08 ? this.config.spread_bps * 2.5 :
                          riskFreeProfit > 0.06 ? this.config.spread_bps * 1.5 :
                          this.config.spread_bps;

        const size = this.compoundingManager.getScaledOrderSize(this.config.order_size);

        console.log(`🎯 EDGE DETECTED | Size: ${size} | Edge: $${riskFreeProfit.toFixed(4)} | Spread: ${spreadBps}bps`);

        estimatedCycleProfit = await this.enterTrade(snapshot, spreadBps, size);
        enteredTrade = estimatedCycleProfit > 0;

        // Record trade for compounding (daily)
        if (estimatedCycleProfit !== 0) {
          this.compoundingManager.recordTrade(estimatedCycleProfit, size);

          // Update circuit breaker with new capital
          const result = this.circuitBreaker.updateCapital(estimatedCycleProfit);
          if (!result.allowed) {
            console.error(`Trade recorded but circuit breaker triggered: ${result.reason}`);
            this.listener.close();
            setTimeout(() => process.exit(1), 1000);
            return;
          }
        }
      }
    }

    // Status logging every 20 cycles
    if (this.state.cycle % 20 === 0) {
      const capital = this.compoundingManager.getCurrentCapital();
      const dailyProfit = this.compoundingManager.getDailyProfit();
      console.log(`\n📊 Cycle ${this.state.cycle} | Mid: $${snapshot.mid_price.toFixed(4)} | Capital: $${capital.toFixed(2)} | Daily: $${dailyProfit.toFixed(2)}`);
    }

    this.options.onCycle?.({
      cycle: this.state.cycle,
      timestamp: Date.now(),
      market_id: this.config.market_id,
      mid_price: snapshot.mid_price,
      seconds_in_candle,
      active_orders: this.placer.getActiveOrders().length,
      in_critical_window: is_critical,
      total_profit: this.state.total_profit,
      capital: this.compoundingManager.getCurrentCapital(),
      circuit_breaker_active: this.circuitBreaker.isActive(),
      edge_detected: edgeDetected,
      risk_free_profit: riskFreeProfit,
      entered_trade: enteredTrade,
      estimated_cycle_profit: estimatedCycleProfit,
      selected_order_size: this.config.order_size,
      selected_spread_bps: this.config.spread_bps,
      order_ids: [],
      snapshot
    });

    this.state.cycle++;
  }

  private async enterTrade(snapshot: MarketSnapshot, spreadBps: number, orderSize: number): Promise<number> {
    const result = await this.placer.placeBothSides(snapshot.mid_price, spreadBps, orderSize);

    // Calculate estimated profit after fees
    const grossProfit = (spreadBps / 10000) * orderSize * 2 * snapshot.mid_price;
    const feeCost = (this.config.fee_rate_bps / 10000) * orderSize * 2 * snapshot.mid_price;
    const estProfit = grossProfit - feeCost;

    console.log(`   Trade entered | Size: ${orderSize} | Est. profit: $${estProfit.toFixed(4)} (after $${feeCost.toFixed(4)} fees)`);

    return estProfit;
  }

  async start() {
    console.log('🚀 BTC 5-Minute Bot (Daily Compounding) started');
    const interval = setInterval(() => this.cycle(), this.config.polling_interval_ms);

    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      clearInterval(interval);
      this.listener.close();
      console.log(this.compoundingManager.getReport());
      process.exit(0);
    });
  }

  async runFor(duration_ms: number) {
    const interval = setInterval(() => this.cycle(), this.config.polling_interval_ms);
    await new Promise(r => setTimeout(r, duration_ms));
    clearInterval(interval);
    this.listener.close();
    console.log("\n=== FINAL COMPOUNDING REPORT ===");
    console.log(this.compoundingManager.getReport());
  }
}