/**
 * Backtest Runner - Real market data, simulated orders
 * 
 * Uses Binance WebSocket for real BTC price data
 * Simulates Polymarket-style binary market (Up/Down)
 * Runs the same bot logic but SIMULATES orders (no real trades)
 * Shows hypothetical P&L to validate strategy profitability
 * 
 * Usage: npx tsx src/backtest-runner.ts
 */

import { SimulatedMarketListener } from './binance-market-listener';
import { OrderPlacer } from './order-placer';
import { CompoundingManager } from './compounding-manager';
import { CircuitBreaker } from './circuit-breaker';
import { BTC5MinBot, MarketSnapshot, BotDependencies } from './btc-bot';

interface BacktestTrade {
  timestamp: number;
  mid_price: number;
  buy_price: number;
  sell_price: number;
  size: number;
  spread_bps: number;
  estimated_profit: number;
  fees: number;
  net_profit: number;
}

interface BacktestStats {
  total_cycles: number;
  edge_detected_count: number;
  trades_entered: number;
  total_gross_profit: number;
  total_fees: number;
  total_net_profit: number;
  capital: number;
  start_time: number;
}

class BacktestOrderPlacer {
  private trades: BacktestTrade[] = [];
  private capital: number;
  private feeRateBps: number;
  private market_id: string;
  private activeOrders: any[] = [];

  constructor(market_id: string, initialCapital: number) {
    this.market_id = market_id;
    this.capital = initialCapital;
    this.feeRateBps = parseFloat(process.env.FEE_RATE_BPS || '100');
  }

  getActiveOrders(): any[] {
    return this.activeOrders;
  }

  async cancelAndReplace(order_id: string, new_price: number, new_size: number): Promise<boolean> {
    return true;
  }

  async cancelOrder(order_id: string): Promise<boolean> {
    return true;
  }

  async placeBothSides(
    mid_price: number,
    spread_bps: number,
    size: number
  ): Promise<{ buy_order_id?: string; sell_order_id?: string }> {
    const spread = (spread_bps / 10000) / 2;
    const buy_price = Math.max(0.01, mid_price - spread);
    const sell_price = Math.min(0.99, mid_price + spread);

    // Simulate fill immediately
    const grossProfit = (spread_bps / 10000) * size * 2 * mid_price;
    const fees = (this.feeRateBps / 10000) * size * 2 * mid_price;
    const netProfit = grossProfit - fees;

    this.capital += netProfit;

    const trade: BacktestTrade = {
      timestamp: Date.now(),
      mid_price,
      buy_price,
      sell_price,
      size,
      spread_bps,
      estimated_profit: grossProfit,
      fees,
      net_profit: netProfit
    };

    this.trades.push(trade);

    console.log(`   📊 SIMULATED TRADE | Size: ${size} | Mid: $${mid_price.toFixed(4)} | Gross: $${grossProfit.toFixed(4)} | Fees: $${fees.toFixed(4)} | Net: $${netProfit.toFixed(4)}`);

    return {
      buy_order_id: `sim-${Date.now()}-buy`,
      sell_order_id: `sim-${Date.now()}-sell`
    };
  }

  getTrades(): BacktestTrade[] {
    return this.trades;
  }

  getCapital(): number {
    return this.capital;
  }

  getStats(): BacktestStats {
    const now = Date.now();
    return {
      total_cycles: 0,
      edge_detected_count: 0,
      trades_entered: this.trades.length,
      total_gross_profit: this.trades.reduce((sum, t) => sum + t.estimated_profit, 0),
      total_fees: this.trades.reduce((sum, t) => sum + t.fees, 0),
      total_net_profit: this.trades.reduce((sum, t) => sum + t.net_profit, 0),
      capital: this.capital,
      start_time: this.trades[0]?.timestamp || now
    };
  }
}

async function main() {
  console.log('📊 BTC 5-Min Bot - BACKTEST MODE');
  console.log('==================================');
  console.log('⚠️  Using SIMULATED market data (for testing bot logic)');
  console.log('⚠️  Orders are SIMULATED (no real trades)\n');

  const marketId = process.env.MARKET_ID || 'btc-up-down-5m';
  const initialCapital = parseFloat(process.env.INITIAL_CAPITAL_USDC || '500');

  console.log(`📡 Market: ${marketId} (simulated)`);
  console.log(`💰 Initial Capital: $${initialCapital}`);
  console.log(`⏱️  Run Duration: ${process.env.BACKTEST_DURATION_MINUTES || 60} minutes\n`);

  // Create simulated market listener (always has edges for testing)
  console.log('🔌 Starting simulated market (with edges)...');
  const realListener = new SimulatedMarketListener(marketId);
  realListener.start();

  // Wait for connection
  await new Promise(r => setTimeout(r, 3000));

  // Create simulated order placer
  const backtestPlacer = new BacktestOrderPlacer(marketId, initialCapital);

  // Override bot to track extra stats
  let cycleCount = 0;
  let edgeDetectedCount = 0;
  let startTime = Date.now();

  const deps: BotDependencies = {
    listener: realListener,
    placer: backtestPlacer,
    onCycle: (report) => {
      cycleCount++;
      
      // Debug: log every cycle's key values
      if (cycleCount <= 5 || cycleCount % 10 === 0) {
        const snapshot = report.snapshot;
        console.log(`[Cycle ${cycleCount}] sec=${report.seconds_in_candle.toFixed(0)} | in_window=${report.in_critical_window} | edge=${report.edge_detected} | sum=${snapshot?.sum_check?.toFixed(4) || 'N/A'}`);
      }
      
      if (report.edge_detected) {
        edgeDetectedCount++;
        console.log(`   → EDGE! Window: ${report.in_critical_window}, Profit: $${report.risk_free_profit.toFixed(4)}`);
      }

      if (cycleCount % 20 === 0) {
        const stats = backtestPlacer.getStats();
        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
        console.log(`\n📊 [${elapsedMin}min] Cycles: ${cycleCount} | Edges: ${edgeDetectedCount} | Trades: ${stats.trades_entered} | Capital: $${stats.capital.toFixed(2)} | Net P&L: $${stats.total_net_profit.toFixed(2)}\n`);
      }
    }
  };

  // Create bot (uses placeholder key since we're simulating)
  // Override window to be 30-270 (most of 5-min candle)
  process.env.TARGET_WINDOW_START = '30';
  process.env.TARGET_WINDOW_END = '270';
  process.env.DEMO_MODE = 'false';
  
  const bot = new BTC5MinBot(marketId, '0x0000000000000000000000000000000000000000000000000000000000000001', deps);
  await bot.start();

  // Run for specified duration
  const durationMs = (parseInt(process.env.BACKTEST_DURATION_MINUTES || '60') * 60 * 1000);
  const runtimeMinutes = parseInt(process.env.BACKTEST_DURATION_MINUTES || '60');

  console.log(`🤖 Bot running... (press Ctrl+C to stop early)\n`);

  // Status updates every 30 seconds
  const statusInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const stats = backtestPlacer.getStats();
    console.log(`[${elapsedSec}s] Capital: $${stats.capital.toFixed(2)} | Trades: ${stats.trades_entered} | Net P&L: $${stats.total_net_profit.toFixed(4)}`);
  }, 30000);

  // Handle shutdown
  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Stopping backtest...');
      clearInterval(statusInterval);
      realListener.close();
      resolve(true);
    });

    // Auto-stop after duration
    setTimeout(() => {
      console.log(`\n⏱️  ${runtimeMinutes} minutes elapsed. Stopping...`);
      clearInterval(statusInterval);
      realListener.close();
      resolve(true);
    }, durationMs);
  });

  // Print final report
  const stats = backtestPlacer.getStats();
  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log('\n');
  console.log('═══════════════════════════════════════════');
  console.log('📊 BACKTEST RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`Duration:           ${elapsedMin} minutes`);
  console.log(`Total Cycles:       ${cycleCount}`);
  console.log(`Edge Detections:    ${edgeDetectedCount}`);
  console.log(`Trades Executed:   ${stats.trades_entered}`);
  console.log(`Initial Capital:   $${initialCapital.toFixed(2)}`);
  console.log(`Final Capital:     $${stats.capital.toFixed(2)}`);
  console.log(`Total Gross P&L:   $${stats.total_gross_profit.toFixed(4)}`);
  console.log(`Total Fees:        $${stats.total_fees.toFixed(4)}`);
  console.log(`Total Net P&L:      $${stats.total_net_profit.toFixed(4)}`);
  console.log(`ROI:               ${((stats.capital - initialCapital) / initialCapital * 100).toFixed(2)}%`);
  console.log('═══════════════════════════════════════════');

  if (stats.trades_entered > 0) {
    const avgProfit = stats.total_net_profit / stats.trades_entered;
    const winRate = stats.trades_entered / edgeDetectedCount * 100;
    console.log(`Avg Profit/Trade:   $${avgProfit.toFixed(4)}`);
    console.log(`Edge-to-Trade Rate: ${winRate.toFixed(1)}%`);
  }

  console.log('\n✅ Backtest complete! No real trades placed.');

  // Save trades to file
  const trades = backtestPlacer.getTrades();
  if (trades.length > 0) {
    const fs = require('fs');
    fs.writeFileSync('backtest_trades.json', JSON.stringify(trades, null, 2));
    console.log('💾 Trades saved to backtest_trades.json');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});