// market-analyzer.ts
// Phase 2: Read-only analysis of real Polymarket BTC 5min markets
// Connects to live API, logs sum_check values, no order placement

import { MarketListener } from './market-listener';
import * as fs from 'fs';
import * as path from 'path';

interface MarketObservation {
  timestamp: number;
  date: string;
  market_id: string;
  best_bid: number;
  best_ask: number;
  mid_price: number;
  sum_check: number;
  edge: number;  // 0.98 - sum_check
  spread_bps: number;
}

class MarketAnalyzer {
  private observations: MarketObservation[] = [];
  private startTime: number = Date.now();
  private logFile: string;
  private edgeCount: number = 0;
  private totalObservations: number = 0;

  constructor(private marketId: string) {
    this.logFile = path.join(process.cwd(), 'market_analysis.json');
    console.log(`🔍 Market Analyzer started`);
    console.log(`   Market: ${marketId}`);
    console.log(`   Log file: ${this.logFile}\n`);
  }

  async run(durationMs: number = 3600000): Promise<void> {  // Default 1 hour
    const wsUrl = process.env.WS_URL || 'wss://ws.polymarket.com';
    console.log(`   WebSocket: ${wsUrl}`);
    const listener = new MarketListener(this.marketId, wsUrl);

    // Log every 500ms (same as bot polling)
    const interval = setInterval(() => {
      this.logObservation(listener.getSnapshot());
    }, 500);

    // Log summary every 5 minutes
    const summaryInterval = setInterval(() => {
      this.printSummary();
    }, 5 * 60 * 1000);

    console.log(`⏱️  Running for ${durationMs / 60000} minutes...\n`);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    clearInterval(interval);
    clearInterval(summaryInterval);
    listener.close();

    this.saveResults();
    this.printFinalReport();
  }

  private logObservation(snapshot: any): void {
    const observation: MarketObservation = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      market_id: this.marketId,
      best_bid: snapshot.best_bid?.price || 0,
      best_ask: snapshot.best_ask?.price || 0,
      mid_price: snapshot.mid_price || 0,
      sum_check: snapshot.sum_check || 1,
      edge: Math.max(0, 0.98 - (snapshot.sum_check || 1)),
      spread_bps: snapshot.best_ask && snapshot.best_bid ?
        ((snapshot.best_ask.price - snapshot.best_bid.price) / snapshot.mid_price) * 10000 : 0
    };

    this.observations.push(observation);
    this.totalObservations++;

    // Log edges
    if (observation.edge > 0) {
      this.edgeCount++;
      console.log(`🎯 EDGE: sum=${observation.sum_check.toFixed(4)} | edge=$${observation.edge.toFixed(4)} | spread=${observation.spread_bps.toFixed(0)}bps`);
    }

    // Log every 100 observations
    if (this.totalObservations % 100 === 0) {
      console.log(`📊 Observation ${this.totalObservations}: bid=${observation.best_bid.toFixed(4)}, ask=${observation.best_ask.toFixed(4)}, sum=${observation.sum_check.toFixed(4)}`);
    }
  }

  private printSummary(): void {
    const runtime = (Date.now() - this.startTime) / 1000;
    const edgesPerHour = (this.edgeCount / runtime) * 3600;
    const totalBps = this.observations.reduce((sum, o) => sum + o.spread_bps, 0);
    const avgSpread = this.observations.length > 0 ? totalBps / this.observations.length : 0;
    const edges = this.observations.filter(o => o.edge > 0);
    const avgEdgeBps = edges.length > 0 ?
      (edges.reduce((sum, o) => sum + o.edge, 0) / edges.length) * 10000 : 0;

    console.log(`\n📊 SUMMARY (${Math.floor(runtime / 60)}min):`);
    console.log(`   Observations: ${this.totalObservations}`);
    console.log(`   Edges found: ${this.edgeCount} (${(this.edgeCount / this.totalObservations * 100).toFixed(1)}%)`);
    console.log(`   Edges/hour: ${edgesPerHour.toFixed(1)}`);
    console.log(`   Avg spread: ${avgSpread.toFixed(0)}bps`);
    console.log(`   Avg edge size: ${avgEdgeBps.toFixed(0)}bps\n`);
  }

  private saveResults(): void {
    const data = {
      market_id: this.marketId,
      start_time: this.startTime,
      end_time: Date.now(),
      total_observations: this.totalObservations,
      edge_count: this.edgeCount,
      observations: this.observations.slice(-1000)  // Last 1000 only
    };

    try {
      fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2));
      console.log(`\n💾 Data saved to ${this.logFile}`);
    } catch (e) {
      console.error('Failed to save results:', e);
    }
  }

  private printFinalReport(): void {
    const runtime = (Date.now() - this.startTime) / 1000 / 3600; // hours
    const edgesPerHour = runtime > 0 ? this.edgeCount / runtime : 0;

    // Calculate spread statistics
    const spreads = this.observations.map(o => o.spread_bps).filter(s => s > 0);
    const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b) / spreads.length : 0;
    const minSpread = spreads.length > 0 ? Math.min(...spreads) : 0;
    const maxSpread = spreads.length > 0 ? Math.max(...spreads) : 0;

    // Calculate edge statistics
    const edges = this.observations.filter(o => o.edge > 0);
    const edgeBpsValues = edges.map(e => e.edge * 10000);
    const avgEdgeBps = edgeBpsValues.length > 0 ?
      edgeBpsValues.reduce((a, b) => a + b) / edgeBpsValues.length : 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 FINAL MARKET ANALYSIS REPORT`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\nRUNTIME:`);
    console.log(`   Duration: ${(runtime * 60).toFixed(0)} minutes (${(runtime).toFixed(2)} hours)`);
    console.log(`   Total observations: ${this.totalObservations}`);

    console.log(`\nMARKET EFFICIENCY:`);
    console.log(`   Edges detected: ${this.edgeCount} (${(this.edgeCount / this.totalObservations * 100).toFixed(1)}%)`);
    console.log(`   Edges per hour: ${edgesPerHour.toFixed(1)}`);
    console.log(`   Avg edge size: ${avgEdgeBps.toFixed(0)}bps ($${(avgEdgeBps / 10000).toFixed(4)})`);

    console.log(`\nSPREAD ANALYSIS:`);
    console.log(`   Average spread: ${avgSpread.toFixed(0)}bps`);
    console.log(`   Min spread: ${minSpread.toFixed(0)}bps`);
    console.log(`   Max spread: ${maxSpread.toFixed(0)}bps`);

    console.log(`\nPROFITABILITY ESTIMATE (200bps spread):`);
    const tradesPerHour = edgesPerHour * 0.3; // 30% fill rate
    const profitPerTrade = 0.02; // $0.02 per $10 order at 200bps
    const hourlyProfit = tradesPerHour * profitPerTrade;
    const dailyProfit = hourlyProfit * 24;
    console.log(`   Edges/hour: ${edgesPerHour.toFixed(1)}`);
    console.log(`   Fill rate: 30% → ${tradesPerHour.toFixed(1)} fills/hour`);
    console.log(`   Profit/trade: $${profitPerTrade}`);
    console.log(`   Hourly profit: $${hourlyProfit.toFixed(2)}`);
    console.log(`   Daily profit: $${dailyProfit.toFixed(2)}`);

    console.log(`\n${'='.repeat(60)}\n`);
  }
}

// Run if called directly
if (require.main === module) {
  const marketId = process.env.MARKET_ID || 'demo-btc-5m';
  const duration = process.env.ANALYSIS_DURATION ?
    parseInt(process.env.ANALYSIS_DURATION) * 60000 : 60000; // Default 1 hour

  const analyzer = new MarketAnalyzer(marketId);
  analyzer.run(duration).catch(err => {
    console.error('Analyzer failed:', err);
    process.exit(1);
  });
}

export { MarketAnalyzer };
