// metrics-v2.ts
// Comprehensive metrics tracking with daily compounding

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

export class MetricsTracker {
  private startTime: number = Date.now();
  private peakCapital: number = 500;
  private snapshots: MetricsSnapshot[] = [];

  // Trade history
  private trades: Array<{
    profit: number;
    timestamp: number;
    size: number;
  }> = [];

  // Hourly profit tracking
  private hourlyProfits: Map<string, number> = new Map();

  // Daily tracking
  private dailyStats = {
    total_trades: 0,
    won_trades: 0,
    lost_trades: 0,
    breakeven_trades: 0,
    gross_profit: 0,
    gross_loss: 0,
    fills: 0,
    cancels: 0,
    orders_placed: 0
  };

  constructor() {
    console.log('Metrics tracker initialized');
  }

  recordTrade(profit: number, timestamp: number, size: number = 1): void {
    this.trades.push({ profit, timestamp, size });

    const epsilon = 0.001;
    if (Math.abs(profit) < epsilon) {
      this.dailyStats.breakeven_trades++;
    } else if (profit > 0) {
      this.dailyStats.won_trades++;
      this.dailyStats.gross_profit += profit;
    } else {
      this.dailyStats.lost_trades++;
      this.dailyStats.gross_loss += Math.abs(profit);
    }
    this.dailyStats.total_trades++;

    // Track hourly profit
    const date = new Date(timestamp);
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
    const currentHourly = this.hourlyProfits.get(hourKey) || 0;
    this.hourlyProfits.set(hourKey, currentHourly + profit);
  }

  recordOrderPlaced(count: number = 1): void {
    this.dailyStats.orders_placed += count;
  }

  recordFill(count: number = 1): void {
    this.dailyStats.fills += count;
  }

  recordCancel(count: number = 1): void {
    this.dailyStats.cancels += count;
  }

  snapshot(capital: number, cycle: number, tier: number, scalingMultiplier: number, nextTierTarget: number, tierProgress: number): MetricsSnapshot {
    if (capital > this.peakCapital) {
      this.peakCapital = capital;
    }

    const runtime = Date.now() - this.startTime;
    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = this.dailyStats.total_trades > 0
      ? (this.dailyStats.won_trades / this.dailyStats.total_trades) * 100
      : 0;
    const avgWin = this.dailyStats.won_trades > 0
      ? this.dailyStats.gross_profit / this.dailyStats.won_trades
      : 0;
    const avgLoss = this.dailyStats.lost_trades > 0
      ? this.dailyStats.gross_loss / this.dailyStats.lost_trades
      : 0;
    const profitFactor = this.dailyStats.gross_loss > 0
      ? this.dailyStats.gross_profit / this.dailyStats.gross_loss
      : (this.dailyStats.gross_profit > 0 ? 999 : 0);
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    let maxDD = 0;
    let maxDDPct = 0;
    let currentDD = 0;
    let currentDDPct = 0;

    if (this.peakCapital > 0) {
      currentDD = Math.max(0, this.peakCapital - capital);
      currentDDPct = (currentDD / this.peakCapital) * 100;
      maxDD = currentDD;
      maxDDPct = currentDDPct;
    }

    const tradesPerHour = runtime > 0 ? (this.dailyStats.total_trades / runtime) * (1000 * 60 * 60) : 0;
    const fillRate = this.dailyStats.orders_placed > 0
      ? (this.dailyStats.fills / this.dailyStats.orders_placed) * 100
      : 0;

    const expectedValue = this.dailyStats.total_trades > 0
      ? totalProfit / this.dailyStats.total_trades
      : 0;

    const now = new Date();
    const currentHourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const hourlyProfit = this.hourlyProfits.get(currentHourKey) || 0;

    const snap: MetricsSnapshot = {
      cycle,
      timestamp: Date.now(),
      capital,
      daily_profit: totalProfit,
      daily_profit_pct: (totalProfit / 500) * 100,
      hourly_profit: hourlyProfit,
      total_profit: totalProfit,
      total_trades: this.dailyStats.total_trades,
      won_trades: this.dailyStats.won_trades,
      lost_trades: this.dailyStats.lost_trades,
      breakeven_trades: this.dailyStats.breakeven_trades,
      win_rate: winRate,
      profit_factor: profitFactor,
      avg_win: avgWin,
      avg_loss: avgLoss,
      risk_reward_ratio: riskRewardRatio,
      expected_value: expectedValue,
      max_drawdown: maxDD,
      max_drawdown_pct: maxDDPct,
      current_drawdown: currentDD,
      current_drawdown_pct: currentDDPct,
      fill_rate: fillRate,
      trades_per_hour: tradesPerHour,
      runtime_ms: runtime,
      tier,
      scaling_multiplier: scalingMultiplier,
      next_tier_target: nextTierTarget,
      tier_progress: tierProgress
    };

    this.snapshots.push(snap);
    return snap;
  }

  getStats() {
    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    return {
      total_trades: this.dailyStats.total_trades,
      won_trades: this.dailyStats.won_trades,
      lost_trades: this.dailyStats.lost_trades,
      breakeven_trades: this.dailyStats.breakeven_trades,
      total_profit: totalProfit,
      gross_profit: this.dailyStats.gross_profit,
      gross_loss: this.dailyStats.gross_loss,
      orders_placed: this.dailyStats.orders_placed,
      fills: this.dailyStats.fills,
      cancels: this.dailyStats.cancels
    };
  }

  getSnapshots(): MetricsSnapshot[] {
    return [...this.snapshots];
  }

  resetDaily(): void {
    this.dailyStats = {
      total_trades: 0,
      won_trades: 0,
      lost_trades: 0,
      breakeven_trades: 0,
      gross_profit: 0,
      gross_loss: 0,
      fills: 0,
      cancels: 0,
      orders_placed: 0
    };
    console.log('Daily stats reset');
  }

  exportForDashboard() {
    const latest = this.snapshots[this.snapshots.length - 1];
    return {
      ...this.dailyStats,
      ...latest,
      snapshots: this.snapshots.slice(-100)
    };
  }

  getReport(): string {
    const stats = this.getStats();
    const totalProfit = stats.total_profit;
    const runtime = Date.now() - this.startTime;
    const hours = runtime / (1000 * 60 * 60);
    const hourlyRate = totalProfit / hours;

    const winRate = stats.total_trades > 0
      ? ((stats.won_trades / stats.total_trades) * 100).toFixed(1)
      : '0.0';
    const profitFactor = stats.gross_loss > 0
      ? (stats.gross_profit / stats.gross_loss).toFixed(2)
      : (stats.gross_profit > 0 ? 'inf' : '0.0');

    const now = new Date();
    const currentHourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const currentHourlyProfit = this.hourlyProfits.get(currentHourKey) || 0;

    return `
========== SESSION METRICS REPORT ==========

TRADE STATISTICS:
  Total Trades:      ${stats.total_trades}
  Won Trades:        ${stats.won_trades} (${winRate}%)
  Lost Trades:       ${stats.lost_trades}
  Breakeven:         ${stats.breakeven_trades}

PROFITABILITY:
  Total Profit:      $${totalProfit.toFixed(2)}
  Gross Win:         $${stats.gross_profit.toFixed(2)}
  Gross Loss:        $${stats.gross_loss.toFixed(2)}
  Profit Factor:     ${profitFactor}x

EXECUTION:
  Orders Placed:     ${stats.orders_placed}
  Fills:             ${stats.fills}
  Cancels:           ${stats.cancels}
  Fill Rate:         ${stats.orders_placed > 0 ? ((stats.fills / stats.orders_placed) * 100).toFixed(1) : 0}%

PERFORMANCE:
  Runtime:           ${hours.toFixed(2)} hours
  Hourly Rate:       $${hourlyRate.toFixed(2)}
  Current Hour:      $${currentHourlyProfit.toFixed(2)}
  Projected 24h:     $${(hourlyRate * 24).toFixed(2)}

================================================
    `;
  }
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

export class DashboardMetricsStore {
  private cycles: BotCycleReport[] = [];
  private trades: TradeResolution[] = [];
  private settlements: SettlementRecord[] = [];
  private hourlyProfits: Map<string, number> = new Map();

  recordCycle(report: BotCycleReport): void {
    this.cycles.push(report);
  }

  recordSettlement(settlement: SettlementRecord): void {
    this.settlements.push(settlement);
  }

  recordTradeResolution(trade: TradeResolution): void {
    this.trades.push(trade);
    console.log(`Trade ${trade.status}: +$${trade.realized_pnl.toFixed(2)}`);

    // Track hourly profit
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const currentHourly = this.hourlyProfits.get(hourKey) || 0;
    this.hourlyProfits.set(hourKey, currentHourly + trade.realized_pnl);
  }

  recordReplacement(oldId: string, newId: string): void {
    console.log(`Replaced ${oldId} with ${newId}`);
  }

  getMetrics() {
    const totalTrades = this.trades.length;
    const wonTrades = this.trades.filter(t => t.status === 'WON').length;
    const dailyProfit = this.trades.reduce((sum, t) => sum + t.realized_pnl, 0);

    const lastCycle = this.cycles[this.cycles.length - 1];
    const capital = lastCycle?.capital || 500;
    const cycle = lastCycle?.cycle || 0;

    // Calculate current hourly profit
    const now = new Date();
    const currentHourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const hourlyProfit = this.hourlyProfits.get(currentHourKey) || 0;

    return {
      cycles: cycle,
      trades: totalTrades,
      won_trades: wonTrades,
      win_rate: totalTrades > 0 ? (wonTrades / totalTrades) * 100 : 0,
      daily_profit: dailyProfit,
      hourly_profit: hourlyProfit,
      capital: capital
    };
  }
}
