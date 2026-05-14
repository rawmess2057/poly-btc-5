// compounding-manager-v2.ts
// Daily compounding with capital-based position sizing
// Day 1: $500 → Day 2: $700 → All positions scale to new capital

import * as fs from 'fs';
import * as path from 'path';

export interface CompoundingState {
  originalCapital: number;
  currentCapital: number;
  dayStartCapital: number;
  totalProfit: number;
  totalWithdrawn: number;
  totalReinvested: number;
  dailyProfit: number;
  peakCapital: number;
  currentTier: 1 | 2 | 3;
  lastResetDate: string; // YYYY-MM-DD format
  history: Array<{
    timestamp: number;
    date: string;
    capital: number;
    dayProfit: number;
    withdrawn: number;
    tier: 1 | 2 | 3;
  }>;
}

export class CompoundingManager {
  private state: CompoundingState;
  private stateFile: string;
  private config = {
    tier1Target: parseFloat(process.env.TIER1_CAPITAL_TARGET || '5000'),
    tier2Target: parseFloat(process.env.TIER2_CAPITAL_TARGET || '25000'),
    tier3Target: parseFloat(process.env.TIER3_CAPITAL_TARGET || '100000'),
    tier1Reinvest: parseFloat(process.env.TIER1_REINVEST_PCT || '100') / 100,
    tier2Reinvest: parseFloat(process.env.TIER2_REINVEST_PCT || '60') / 100,
    tier3Reinvest: parseFloat(process.env.TIER3_REINVEST_PCT || '40') / 100,
  };

  constructor(initialCapital: number = 500) {
    this.stateFile = path.join(process.cwd(), 'compounding_state.json');

    // Try to load existing state
    if (fs.existsSync(this.stateFile)) {
      try {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        this.state = JSON.parse(data);
        console.log(`✅ Loaded compounding state: $${this.state.currentCapital.toFixed(2)}`);
      } catch (e) {
        console.warn('⚠️ Failed to load state, creating new:', e);
        this.state = this.createNewState(initialCapital);
      }
    } else {
      this.state = this.createNewState(initialCapital);
    }

    // Check if it's a new day and reset daily metrics
    this.checkAndResetDay();
  }

  /**
   * Create initial state
   */
  private createNewState(initialCapital: number): CompoundingState {
    return {
      originalCapital: initialCapital,
      currentCapital: initialCapital,
      dayStartCapital: initialCapital,
      totalProfit: 0,
      totalWithdrawn: 0,
      totalReinvested: 0,
      dailyProfit: 0,
      peakCapital: initialCapital,
      currentTier: 1,
      lastResetDate: new Date().toISOString().split('T')[0],
      history: []
    };
  }

  /**
   * Check if it's a new day and reset daily metrics
   */
  private checkAndResetDay(): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (this.state.lastResetDate !== today) {
      // It's a new day!
      console.log(`\n🌅 NEW DAY DETECTED!`);
      console.log(`   Previous day capital: $${this.state.currentCapital.toFixed(2)}`);
      
      // Reset daily profit but keep capital
      const newDayCapital = this.state.currentCapital;
      this.state.dayStartCapital = newDayCapital;
      this.state.dailyProfit = 0;
      this.state.lastResetDate = today;

      // Log the daily transition
      this.state.history.push({
        timestamp: Date.now(),
        date: today,
        capital: newDayCapital,
        dayProfit: 0,
        withdrawn: 0,
        tier: this.state.currentTier
      });

      console.log(`   New day capital: $${newDayCapital.toFixed(2)}`);
      console.log(`   All position sizes will scale to this capital\n`);

      this.saveState();
    }
  }

  /**
   * Record a trade result
   * Called after each cycle profit/loss
   */
  recordTrade(tradeProfit: number, tradeSize: number = 1): void {
    const before = this.state.currentCapital;
    
    // Update capital and daily profit
    this.state.currentCapital += tradeProfit;
    this.state.dailyProfit += tradeProfit;
    this.state.totalProfit += tradeProfit;

    // Update peak
    if (this.state.currentCapital > this.state.peakCapital) {
      this.state.peakCapital = this.state.currentCapital;
    }

    // Check tier progression
    const newTier = this.detectTier();
    if (newTier !== this.state.currentTier) {
      console.log(`\n🎉 TIER UPGRADE: ${this.state.currentTier} → ${newTier}`);
      console.log(`   Capital: $${this.state.currentCapital.toFixed(2)}`);
      this.state.currentTier = newTier;
    }

    // Note: Circuit breaker logic moved to CircuitBreaker class
    // This is now handled in btc-bot.ts via circuitBreaker.updateCapital()

    this.saveState();
  }

  /**
   * Get position size scaled to current capital
   * E.g. if capital doubled, order size doubles
   */
  getScaledOrderSize(baseOrderSize: number): number {
    const capitalRatio = this.state.currentCapital / this.state.originalCapital;
    const scaled = baseOrderSize * Math.sqrt(capitalRatio);
    return parseFloat(scaled.toFixed(2));
  }

  /**
   * Get current capital (for display)
   */
  getCurrentCapital(): number {
    return this.state.currentCapital;
  }

  /**
   * Get daily profit
   */
  getDailyProfit(): number {
    return this.state.dailyProfit;
  }

  /**
   * Get daily profit percentage
   */
  getDailyProfitPct(): number {
    if (this.state.dayStartCapital === 0) return 0;
    return (this.state.dailyProfit / this.state.dayStartCapital) * 100;
  }

  /**
   * Detect current tier based on capital
   */
  private detectTier(): 1 | 2 | 3 {
    if (this.state.currentCapital >= this.config.tier3Target) return 3;
    if (this.state.currentCapital >= this.config.tier2Target) return 2;
    return 1;
  }

  /**
   * Get current tier
   */
  getCurrentTier(): 1 | 2 | 3 {
    return this.state.currentTier;
  }

  /**
   * Get reinvestment percentage for current tier
   */
  getReinvestmentPct(): number {
    switch (this.state.currentTier) {
      case 1: return this.config.tier1Reinvest;
      case 2: return this.config.tier2Reinvest;
      case 3: return this.config.tier3Reinvest;
      default: return 1;
    }
  }

  /**
   * Get withdrawal percentage for current tier
   */
  getWithdrawalPct(): number {
    return 1 - this.getReinvestmentPct();
  }

  /**
   * Process daily reset (call at midnight)
   */
  processDailyReset(): void {
    this.checkAndResetDay();
  }

  /**
   * Get full state
   */
  getState(): CompoundingState {
    return { ...this.state };
  }

  /**
   * Get formatted report
   */
  getReport(): string {
    const today = new Date().toISOString().split('T')[0];
    const tier = this.state.currentTier;
    const reinvest = this.getReinvestmentPct() * 100;
    const withdraw = this.getWithdrawalPct() * 100;

    return `
╔════════════════════════════════════════════╗
║      DAILY COMPOUNDING REPORT              ║
╚════════════════════════════════════════════╝

DATE: ${today}
TIER: ${tier} (${['Tier 1: 100% reinvest', 'Tier 2: 60% reinvest', 'Tier 3: 40% reinvest'][tier - 1]})

CAPITAL:
  Day Start:     $${this.state.dayStartCapital.toFixed(2)}
  Current:       $${this.state.currentCapital.toFixed(2)}
  Daily Profit:  $${this.state.dailyProfit.toFixed(2)} (${this.getDailyProfitPct().toFixed(2)}%)
  
TOTALS (Lifetime):
  Total Profit:  $${this.state.totalProfit.toFixed(2)}
  Reinvested:    $${this.state.totalReinvested.toFixed(2)}
  Withdrawn:     $${this.state.totalWithdrawn.toFixed(2)}
  Peak Capital:  $${this.state.peakCapital.toFixed(2)}

STRATEGY:
  Tier ${tier} - ${reinvest.toFixed(0)}% reinvest / ${withdraw.toFixed(0)}% withdraw
  Next tier at: $${this.getNextTierTarget().toFixed(0)}
  Progress: ${this.getTierProgress().toFixed(1)}%

════════════════════════════════════════════
    `;
  }

  /**
   * Get next tier target
   */
  private getNextTierTarget(): number {
    switch (this.state.currentTier) {
      case 1: return this.config.tier2Target;
      case 2: return this.config.tier3Target;
      case 3: return this.config.tier3Target * 2; // Keep scaling
      default: return 0;
    }
  }

  /**
   * Get progress to next tier
   */
  private getTierProgress(): number {
    const current = this.state.currentCapital;
    const targets: { [k: number]: [number, number] } = {
      1: [this.config.tier1Target, this.config.tier2Target],
      2: [this.config.tier2Target, this.config.tier3Target],
      3: [this.config.tier3Target, this.config.tier3Target * 2]
    };

    const [start, end] = targets[this.state.currentTier] || [0, 0];
    return ((current - start) / (end - start)) * 100;
  }

  /**
   * Export for dashboard
   */
  exportForDashboard() {
    return {
      originalCapital: this.state.originalCapital,
      currentCapital: this.state.currentCapital,
      dayStartCapital: this.state.dayStartCapital,
      totalProfit: this.state.totalProfit,
      totalWithdrawn: this.state.totalWithdrawn,
      totalReinvested: this.state.totalReinvested,
      dailyProfit: this.state.dailyProfit,
      dailyProfitPct: this.getDailyProfitPct(),
      peakCapital: this.state.peakCapital,
      currentTier: this.state.currentTier,
      tierProgress: this.getTierProgress(),
      nextTierTarget: this.getNextTierTarget(),
      reinvestmentPct: this.getReinvestmentPct() * 100,
      withdrawalPct: this.getWithdrawalPct() * 100
    };
  }

  /**
   * Save state to file
   */
  private saveState(): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('Failed to save compounding state:', e);
    }
  }

  /**
   * Get scaling info for debugging
   */
  getScalingInfo(baseSize: number): {
    baseSize: number;
    scaledSize: number;
    capital: number;
    capitalRatio: number;
    tier: number;
  } {
    const capital = this.state.currentCapital;
    const capitalRatio = capital / this.state.originalCapital;
    const scaled = this.getScaledOrderSize(baseSize);

    return {
      baseSize,
      scaledSize: scaled,
      capital,
      capitalRatio,
      tier: this.state.currentTier
    };
  }
}