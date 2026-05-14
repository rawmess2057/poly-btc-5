// src/circuit-breaker.ts
// Robust circuit breaker that prevents unlimited losses

export interface CircuitBreakerState {
  isTriggered: boolean;
  triggeredAt: number;
  triggerReason: string;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    isTriggered: false,
    triggeredAt: 0,
    triggerReason: '',
    maxDailyLossPct: 0.15,      // 15% daily loss limit
    maxDrawdownPct: 0.25        // 25% drawdown limit
  };

  private dailyStartCapital: number = 500;
  private peakCapital: number = 500;
  private currentCapital: number = 500;
  private dailyProfit: number = 0;
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  constructor(initialCapital: number = 500) {
    this.currentCapital = initialCapital;
    this.dailyStartCapital = initialCapital;
    this.peakCapital = initialCapital;
    console.log(`Circuit Breaker initialized with $${initialCapital}`);
  }

  isActive(): boolean {
    return this.state.isTriggered;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  updateCapital(profit: number): { allowed: boolean; reason?: string } {
    if (this.state.isTriggered) {
      return {
        allowed: false,
        reason: `Circuit breaker already triggered: ${this.state.triggerReason}`
      };
    }

    this.currentCapital += profit;
    this.dailyProfit += profit;

    if (this.currentCapital > this.peakCapital) {
      this.peakCapital = this.currentCapital;
    }

    const dailyLossPct = Math.abs(this.dailyProfit) / this.dailyStartCapital;
    if (this.dailyProfit < 0 && dailyLossPct > this.state.maxDailyLossPct) {
      this.triggerBreaker(
        `Daily loss ${(dailyLossPct * 100).toFixed(1)}% exceeds limit ${(this.state.maxDailyLossPct * 100).toFixed(1)}%`
      );
      return { allowed: false, reason: this.state.triggerReason };
    }

    const drawdown = this.peakCapital - this.currentCapital;
    const drawdownPct = drawdown / this.peakCapital;
    if (drawdownPct > this.state.maxDrawdownPct) {
      this.triggerBreaker(
        `Drawdown ${(drawdownPct * 100).toFixed(1)}% exceeds limit ${(this.state.maxDrawdownPct * 100).toFixed(1)}%`
      );
      return { allowed: false, reason: this.state.triggerReason };
    }

    if (this.currentCapital <= 0) {
      this.triggerBreaker('Account balance depleted');
      return { allowed: false, reason: this.state.triggerReason };
    }

    return { allowed: true };
  }

  private triggerBreaker(reason: string): void {
    this.state.isTriggered = true;
    this.state.triggeredAt = Date.now();
    this.state.triggerReason = reason;

    console.error(`\n${'='.repeat(60)}`);
    console.error(`CIRCUIT BREAKER TRIGGERED`);
    console.error(`${'='.repeat(60)}`);
    console.error(`Reason: ${reason}`);
    console.error(`Time: ${new Date().toISOString()}`);
    console.error(`Capital: $${this.currentCapital.toFixed(2)}`);
    console.error(`Daily Loss: $${Math.abs(this.dailyProfit).toFixed(2)}`);
    console.error(`${'='.repeat(60)}\n`);

    this.emitAlert('CIRCUIT_BREAKER', reason);
  }

  resetForNewDay(): void {
    const today = new Date().toISOString().split('T')[0];

    if (today !== this.lastResetDate) {
      console.log(`\nDaily reset - Circuit breaker reset`);
      console.log(`   Start capital: $${this.currentCapital.toFixed(2)}`);

      this.dailyStartCapital = this.currentCapital;
      this.dailyProfit = 0;
      this.lastResetDate = today;
      this.peakCapital = Math.max(this.peakCapital, this.currentCapital);

      this.state.isTriggered = false;
      this.state.triggeredAt = 0;
      this.state.triggerReason = '';

      console.log(`   Allowed daily loss: $${(this.dailyStartCapital * this.state.maxDailyLossPct).toFixed(2)}\n`);
    }
  }

  getMetrics() {
    const dailyLossPct = this.dailyProfit / this.dailyStartCapital;
    const drawdown = this.peakCapital - this.currentCapital;
    const drawdownPct = drawdown / this.peakCapital;
    const maxDailyLossAllowed = this.dailyStartCapital * this.state.maxDailyLossPct;

    return {
      capital: this.currentCapital,
      dailyProfit: this.dailyProfit,
      dailyLossPct: dailyLossPct * 100,
      dailyLossAllowed: maxDailyLossAllowed,
      drawdown: drawdown,
      drawdownPct: drawdownPct * 100,
      peakCapital: this.peakCapital,
      isTriggered: this.state.isTriggered,
      healthStatus: this.getHealthStatus()
    };
  }

  private getHealthStatus(): 'healthy' | 'warning' | 'critical' | 'broken' {
    if (this.state.isTriggered) return 'broken';

    const dailyLossPct = Math.abs(this.dailyProfit) / this.dailyStartCapital;
    const drawdown = this.peakCapital - this.currentCapital;
    const drawdownPct = drawdown / this.peakCapital;

    if (dailyLossPct > this.state.maxDailyLossPct * 0.8 ||
        drawdownPct > this.state.maxDrawdownPct * 0.8) {
      return 'critical';
    }

    if (dailyLossPct > this.state.maxDailyLossPct * 0.5 ||
        drawdownPct > this.state.maxDrawdownPct * 0.5) {
      return 'warning';
    }

    return 'healthy';
  }

  getReport(): string {
    const metrics = this.getMetrics();
    const dailyLossMax = this.dailyStartCapital * this.state.maxDailyLossPct;

    return `
========== CIRCUIT BREAKER STATUS ==========

STATUS: ${metrics.isTriggered ? 'TRIGGERED' : 'ACTIVE'}
Health: ${metrics.healthStatus.toUpperCase()}

CAPITAL:
  Current:          $${metrics.capital.toFixed(2)}
  Daily Profit:     $${metrics.dailyProfit.toFixed(2)} (${metrics.dailyLossPct.toFixed(2)}%)
  Peak:             $${metrics.peakCapital.toFixed(2)}

LOSS LIMITS:
  Daily Loss Max:   $${dailyLossMax.toFixed(2)}
  Drawdown Max:     $${(this.state.maxDrawdownPct * 100).toFixed(0)}%

CURRENT STATUS:
  Daily Loss Used:  ${(metrics.dailyLossPct / this.state.maxDailyLossPct * 100).toFixed(1)}% of limit
  Drawdown Used:    ${(metrics.drawdownPct / this.state.maxDrawdownPct * 100).toFixed(1)}% of limit

TRIGGERED: ${metrics.isTriggered ? `YES - ${this.state.triggerReason}` : 'NO'}

==============================================
    `;
  }

  private emitAlert(type: string, message: string): void {
    console.error(`[ALERT:${type}] ${message}`);
  }

  manualReset(): void {
    console.warn('Manual circuit breaker reset');
    this.state.isTriggered = false;
    this.state.triggeredAt = 0;
    this.state.triggerReason = '';
  }
}
