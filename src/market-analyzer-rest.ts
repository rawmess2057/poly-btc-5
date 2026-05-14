// market-analyzer-rest.ts
// Phase 2: REST API-based market analysis for Polymarket BTC 5min
// Uses HTTP polling instead of WebSocket to avoid SSL issues

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface MarketObservation {
  timestamp: number;
  date: string;
  market_slug: string;
  token_id: string;
  best_bid: number;
  best_ask: number;
  mid_price: number;
  sum_check: number;
  edge: number;
  spread_bps: number;
  volume_24h?: number;
}

interface MarketInfo {
  conditionId: string;
  question: string;
  slug: string;
  active: boolean;
  closed: boolean;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
}

class MarketAnalyzerREST {
  private observations: MarketObservation[] = [];
  private startTime: number = Date.now();
  private logFile: string;
  private edgeCount: number = 0;
  private totalObservations: number = 0;
  private marketSlug: string = '';
  private tokenIds: string[] = [];

  constructor(private marketId: string) {
    this.logFile = path.join(process.cwd(), 'market_analysis.json');
    console.log(`🔍 Market Analyzer REST started`);
    console.log(`   Market ID: ${marketId}`);
    console.log(`   Log file: ${this.logFile}\n`);
  }

  async initialize(): Promise<void> {
    try {
      // Try to get market info from Gamma API
      const gammaUrl = `https://gamma-api.polymarket.com/markets/${this.marketId}`;
      console.log(`📡 Fetching market info from Gamma API...`);

      const response = await axios.get(gammaUrl);
      const market: MarketInfo = response.data;

      if (market && market.tokens) {
        this.marketSlug = market.slug;
        this.tokenIds = market.tokens.map(t => t.token_id);
        console.log(`   Market: ${market.question}`);
        console.log(`   Tokens: ${this.tokenIds.length}`);
        console.log(`   Status: ${market.active ? 'ACTIVE' : 'CLOSED'}\n`);
      }
    } catch (error: any) {
      console.warn(`⚠️  Could not fetch from Gamma API: ${error.message}`);
      console.log(`   Will try CLOB API directly...\n`);
    }
  }

  async run(durationMs: number = 3600000): Promise<void> {
    await this.initialize();

    // Poll every 500ms (same as bot)
    const interval = setInterval(() => {
      this.pollMarketData();
    }, 500);

    // Log summary every 5 minutes
    const summaryInterval = setInterval(() => {
      this.printSummary();
    }, 5 * 60 * 1000);

    console.log(`⏱️  Running for ${durationMs / 60000} minutes...\n`);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    clearInterval(interval);
    clearInterval(summaryInterval);

    this.saveResults();
    this.printFinalReport();
  }

  private async pollMarketData(): Promise<void> {
    try {
      // Try to get price from CLOB API
      const clobUrl = `https://clob.polymarket.com/prices?token_id=${this.marketId}`;
      const response = await axios.get(clobUrl, { timeout: 5000 });

      if (response.data && response.data.length > 0) {
        const tokenData = response.data[0];
        const price = tokenData.price || 0.5;

        // For YES token: bid = price, ask = 1 - price (approximately)
        const bestBid = price;
        const bestAsk = 1 - price;
        const midPrice = (bestBid + bestAsk) / 2;
        const sumCheck = bestBid + (1 - bestAsk);
        const edge = Math.max(0, 0.98 - sumCheck);
        const spreadBps = ((bestAsk - bestBid) / midPrice) * 10000;

        const observation: MarketObservation = {
          timestamp: Date.now(),
          date: new Date().toISOString(),
          market_slug: this.marketSlug || this.marketId,
          token_id: this.marketId,
          best_bid: bestBid,
          best_ask: bestAsk,
          mid_price: midPrice,
          sum_check: sumCheck,
          edge: edge,
          spread_bps: spreadBps
        };

        this.observations.push(observation);
        this.totalObservations++;

        if (edge > 0) {
          this.edgeCount++;
          console.log(`🎯 EDGE: sum=${sumCheck.toFixed(4)} | edge=$${edge.toFixed(4)} | spread=${spreadBps.toFixed(0)}bps`);
        }

        if (this.totalObservations % 100 === 0) {
          console.log(`📊 Observation ${this.totalObservations}: bid=${bestBid.toFixed(4)}, ask=${bestAsk.toFixed(4)}, sum=${sumCheck.toFixed(4)}`);
        }
      }
    } catch (error: any) {
      console.error(`API poll error: ${error.message}`);
    }
  }

  private printSummary(): void {
    const runtime = (Date.now() - this.startTime) / 1000;
    const edgesPerHour = runtime > 0 ? (this.edgeCount / runtime) * 3600 : 0;
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
    console.log(`   Avg edge size: ${avgEdgeBps.toFixed(0)}bps (${(avgEdgeBps / 10000).toFixed(4)})\n`);
  }

  private saveResults(): void {
    const data = {
      market_id: this.marketId,
      market_slug: this.marketSlug,
      start_time: this.startTime,
      end_time: Date.now(),
      total_observations: this.totalObservations,
      edge_count: this.edgeCount,
      observations: this.observations.slice(-1000) // Last 1000 only
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

    const spreads = this.observations.map(o => o.spread_bps).filter(s => s > 0);
    const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b) / spreads.length : 0;
    const minSpread = spreads.length > 0 ? Math.min(...spreads) : 0;
    const maxSpread = spreads.length > 0 ? Math.max(...spreads) : 0;

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

    // Capital projection
    const startingCapital = 500;
    const dailyReturnPct = (dailyProfit / startingCapital) * 100;
    console.log(`\nPROJECTION (starting $${startingCapital}):`);
    console.log(`   Daily return: ${dailyReturnPct.toFixed(2)}%`);
    console.log(`   Days to double: ${(70 / dailyReturnPct).toFixed(1)} (Rule of 72)`);

    console.log(`\n${'='.repeat(60)}\n`);
  }
}

// Run if called directly
if (require.main === module) {
  const marketId = process.env.MARKET_ID || process.argv[2] || 'demo-btc-5m';
  const duration = process.env.ANALYSIS_DURATION ?
    parseInt(process.env.ANALYSIS_DURATION) * 60000 : 600000; // Default 10 min

  const analyzer = new MarketAnalyzerREST(marketId);
  analyzer.run(duration).catch(err => {
    console.error('Analyzer failed:', err);
    process.exit(1);
  });
}

export { MarketAnalyzerREST };
