// compounding-manager.ts
// Fixed version that integrates seamlessly with btc-bot.ts

import * as fs from 'fs';

interface CompoundingState {
  originalCapital: number;
  currentCapital: number;
  totalProfit: number;
  totalWithdrawn: number;
  totalReinvested: number;
  dailyProfit: number;
  peakCapital: number;
  currentTier: 1 | 2 | 3;
  history: Array<{
    timestamp: number;
    capital: number;
    profit: number;
    withdrawn: number;
    tier: number;
  }>;
}

export class CompoundingManager {
  private state: CompoundingState;
  private stateFile = 'compounding_state.json';

  // Configuration from .env (read directly, no constructor config needed)
  private config = {
    enabled: process.env.COMPOUNDING_ENABLED === 'true',
    strategy: (process.env.COMPOUNDING_STRATEGY || 'tiered') as 'aggressive' | 'tiered' | 'milestone',
    tier1Target: parseFloat(process.env.TIER1_CAPITAL_TARGET || '5000'),
    tier1Reinvest: parseFloat(process.env.TIER1_REINVEST_PCT || '100'),
    tier2Target: parseFloat(process.env.TIER2_CAPITAL_TARGET || '25000'),
    tier2Reinvest: parseFloat(process.env.TIER2_REINVEST_PCT || '60'),
    tier3Target: parseFloat(process.env.TIER3_CAPITAL_TARGET || '100000'),
    tier3Reinvest: parseFloat(process.env.TIER3_REINVEST_PCT || '40'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS_PCT || '15'),
  };

  /**
   * Constructor - takes only initial capital
   * Configuration comes from .env file
   */
  constructor(initialCapital: number) {
    this.state = this.loadState(initialCapital);
    if (this.config.enabled) {
      console.log(`   Strategy: ${this.config.strategy}`);
      console.log(`   Tier 1: $${this.config.tier1Target} (reinvest ${this.config.tier1Reinvest}%)`);
      console.log(`   Tier 2: $${this.config.tier2Target} (reinvest ${this.config.tier2Reinvest}%)`);
      console.log(`   Tier 3: $${this.config.tier3Target} (reinvest ${this.config.tier3Reinvest}%)`);
    }
  }

  /**
   * Load state from disk or initialize new
   */
  private loadState(initialCapital: number): CompoundingState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        console.log('✅ Loaded compounding state from disk');
        return data;
      }
    } catch (err) {
      console.log('📝 Initializing new compounding state');
    }

    return {
      originalCapital: initialCapital,
      currentCapital: initialCapital,
      totalProfit: 0,
      totalWithdrawn: 0,
      totalReinvested: 0,
      dailyProfit: 0,
      peakCapital: initialCapital,
      currentTier: 1,
      history: []
    };
  }

  /**
   * Save state to disk
   */
  private save(): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('❌ Failed to save compounding state:', err);
    }
  }

  /**
   * Process profit from a trade
   * Returns: reinvested amount, withdrawn amount, new capital, and whether rebalance is needed
   */
  processTrade(profit: number): {
    reinvested: number;
    withdrawn: number;
    newCapital: number;
    rebalanceNeeded: boolean;
    circuitBreakerTriggered: boolean;
  } {
    if (!this.config.enabled) {
      return {
        reinvested: 0,
        withdrawn: 0,
        newCapital: this.state.currentCapital,
        rebalanceNeeded: false,
        circuitBreakerTriggered: false
      };
    }

    // Add profit to daily total
    this.state.totalProfit += profit;
    this.state.dailyProfit += profit;

    // Check circuit breaker - stop if daily loss exceeds threshold
    const dailyLossPct = Math.abs(this.state.dailyProfit) / this.state.currentCapital * 100;
    if (dailyLossPct > this.config.maxDailyLoss && this.state.dailyProfit < 0) {
      console.warn(`⚠️ CIRCUIT BREAKER: Daily loss ${dailyLossPct.toFixed(1)}% > ${this.config.maxDailyLoss}%`);
      return {
        reinvested: 0,
        withdrawn: 0,
        newCapital: this.state.currentCapital,
        rebalanceNeeded: false,
        circuitBreakerTriggered: true
      };
    }

    // Calculate reinvestment based on strategy and tier
    const { reinvested, withdrawn } = this.calculateReinvestment(profit);

    // Update capital
    const capitalBefore = this.state.currentCapital;
    this.state.currentCapital += reinvested;
    this.state.totalReinvested += reinvested;
    this.state.totalWithdrawn += withdrawn;

    // Update peak capital
    if (this.state.currentCapital > this.state.peakCapital) {
      this.state.peakCapital = this.state.currentCapital;
    }

    // Check tier upgrade
    const tierBefore = this.state.currentTier;
    this.updateTier();
    const tierChanged = this.state.currentTier !== tierBefore;

    // Log to history
    this.state.history.push({
      timestamp: Date.now(),
      capital: this.state.currentCapital,
      profit,
      withdrawn,
      tier: this.state.currentTier
    });

    // If tier upgraded, log it
    if (tierChanged) {
      console.log(`⭐ TIER UPGRADE: Tier ${tierBefore} → Tier ${this.state.currentTier}`);
    }

    this.save();

    // Rebalance needed if capital grew significantly or tier changed
    const rebalanceNeeded = (this.state.currentCapital / capitalBefore) > 1.05 || tierChanged;

    return {
      reinvested,
      withdrawn,
      newCapital: this.state.currentCapital,
      rebalanceNeeded,
      circuitBreakerTriggered: false
    };
  }

  /**
   * Calculate reinvestment based on strategy and current tier
   */
  private calculateReinvestment(profit: number): { reinvested: number; withdrawn: number } {
    let reinvestPct: number;

    if (this.config.strategy === 'aggressive') {
      // Aggressive: reinvest everything
      reinvestPct = 100;
    } else if (this.config.strategy === 'tiered') {
      // Tiered: depends on current tier
      if (this.state.currentTier === 1) {
        reinvestPct = this.config.tier1Reinvest;
      } else if (this.state.currentTier === 2) {
        reinvestPct = this.config.tier2Reinvest;
      } else {
        reinvestPct = this.config.tier3Reinvest;
      }
    } else {
      // Milestone or default: fixed reinvestment
      reinvestPct = 50;
    }

    const reinvested = profit * (reinvestPct / 100);
    const withdrawn = profit - reinvested;

    return { reinvested, withdrawn };
  }

  /**
   * Update tier based on current capital
   */
  private updateTier(): void {
    if (this.state.currentCapital >= this.config.tier3Target) {
      this.state.currentTier = 3;
    } else if (this.state.currentCapital >= this.config.tier2Target) {
      this.state.currentTier = 2;
    } else {
      this.state.currentTier = 1;
    }
  }

  /**
   * Get order size based on compounded capital
   * Scales with square root to avoid exponential growth
   */
  getOrderSize(baseSize: number = 10): number {
    const ratio = this.state.currentCapital / this.state.originalCapital;
    // Scale by square root to avoid exponential blowout
    const scaled = baseSize * Math.sqrt(ratio);
    return Math.round(scaled * 100) / 100;
  }

  /**
   * Get current capital
   */
  getCapital(): number {
    return this.state.currentCapital;
  }

  /**
   * Get current tier
   */
  getTier(): 1 | 2 | 3 {
    return this.state.currentTier;
  }

  /**
   * Get daily statistics
   */
  getDailyStats(): {
    capital: number;
    dailyProfit: number;
    dailyReturn: number;
    withdrawn: number;
    tier: number;
  } {
    return {
      capital: this.state.currentCapital,
      dailyProfit: this.state.dailyProfit,
      dailyReturn: (this.state.dailyProfit / this.state.currentCapital) * 100,
      withdrawn: this.state.totalWithdrawn,
      tier: this.state.currentTier
    };
  }

  /**
   * Reset daily counter (call at midnight)
   */
  resetDaily(): void {
    const stats = this.getDailyStats();
    console.log(`
📊 DAILY RESET
  Profit: $${stats.dailyProfit.toFixed(2)}
  Return: ${stats.dailyReturn.toFixed(2)}%
  Capital: $${stats.capital.toFixed(2)}
  Tier: ${stats.tier}
    `);
    this.state.dailyProfit = 0;
    this.save();
  }

  /**
   * Get full performance report
   */
  getReport(): string {
    const roi = ((this.state.currentCapital - this.state.originalCapital) / this.state.originalCapital * 100).toFixed(1);
    const dailyCompound = ((this.state.currentCapital / this.state.originalCapital) ** (1 / Math.max(1, this.state.history.length)) - 1) * 100;

    return `
═══════════════════════════════════════════════
           COMPOUNDING REPORT
═══════════════════════════════════════════════

CAPITAL GROWTH:
  Original:         $${this.state.originalCapital.toFixed(2)}
  Current:          $${this.state.currentCapital.toFixed(2)}
  Peak:             $${this.state.peakCapital.toFixed(2)}
  ROI:              ${roi}%

COMPOUNDING:
  Strategy:         ${this.config.strategy}
  Tier:             ${this.state.currentTier}
  Daily Rate:       ${dailyCompound.toFixed(2)}%

PROFIT & WITHDRAWALS:
  Total Profit:     $${this.state.totalProfit.toFixed(2)}
  Reinvested:       $${this.state.totalReinvested.toFixed(2)}
  Withdrawn:        $${this.state.totalWithdrawn.toFixed(2)}

STATISTICS:
  Total Trades:     ${this.state.history.length}
  Status:           Tier ${this.state.currentTier} (${this.config.strategy})

═══════════════════════════════════════════════
    `;
  }
}