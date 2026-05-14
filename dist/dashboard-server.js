"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardServer = void 0;
// dashboard-server-v2.ts - Daily Compounding Dashboard
const http = __importStar(require("http"));
class DashboardServer {
    constructor(port = 3000, metricsStore) {
        this.equityHistory = [];
        this.eventLog = [];
        this.startTime = Date.now();
        this.startCapital = 500;
        this.maxEquity = 500;
        this.minEquity = 500;
        this.metricsStore = metricsStore;
        this.startCapital = 500;
        this.startTime = Date.now();
        this.metrics = {
            timestamp: Date.now(),
            cycle: 0,
            capital: 500,
            daily_profit: 0,
            hourly_profit: 0,
            total_profit: 0,
            win_rate: 0,
            profit_factor: 0,
            fill_rate: 0,
            tier: 1,
            scaling_multiplier: 1,
            tier_progress: 0,
            trades_per_hour: 0,
            status: 'Initializing...',
            equity_history: [],
            total_trades: 0,
            won_trades: 0,
            avg_profit: 0,
            max_drawdown: 0,
            current_risk: 0,
            runtime_ms: 0,
            events: []
        };
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`Dashboard running at http://localhost:${port}`);
        });
        setInterval(() => this.updateMetrics(), 1000);
    }
    addEvent(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.eventLog.push(`[${timestamp}] ${message}`);
        if (this.eventLog.length > 50)
            this.eventLog.shift();
    }
    updateMetrics() {
        if (this.metricsStore) {
            const m = this.metricsStore.getMetrics();
            this.equityHistory.push(m.capital);
            if (this.equityHistory.length > 100)
                this.equityHistory.shift();
            if (m.capital > this.maxEquity)
                this.maxEquity = m.capital;
            if (m.capital < this.minEquity)
                this.minEquity = m.capital;
            const runtimeMs = Date.now() - this.startTime;
            const hoursRunning = runtimeMs / (1000 * 60 * 60);
            const tradesPerHour = hoursRunning > 0 ? m.trades / hoursRunning : 0;
            const maxDrawdown = this.maxEquity > 0 ? ((this.maxEquity - this.minEquity) / this.maxEquity) * 100 : 0;
            const currentRisk = this.maxEquity > 0 ? ((this.maxEquity - m.capital) / this.maxEquity) * 100 : 0;
            this.metrics = {
                timestamp: Date.now(),
                cycle: m.cycles,
                capital: Math.round(m.capital * 100) / 100,
                daily_profit: Math.round(m.daily_profit * 100) / 100,
                hourly_profit: Math.round(m.hourly_profit * 100) / 100,
                total_profit: Math.round((m.capital - this.startCapital) * 100) / 100,
                win_rate: Math.round(m.win_rate * 10) / 10,
                profit_factor: m.win_rate > 0 ? Math.round(m.daily_profit / m.trades * 100) / 100 : 0,
                fill_rate: m.trades > 0 ? Math.round(m.won_trades / m.trades * 100) : 0,
                tier: Math.floor(m.capital / 5000) + 1,
                scaling_multiplier: Math.round(Math.sqrt(m.capital / 500) * 100) / 100,
                tier_progress: Math.round((m.capital % 5000) / 50 * 10) / 10,
                trades_per_hour: Math.round(tradesPerHour * 10) / 10,
                status: 'Live • Compounding Daily',
                equity_history: this.equityHistory.slice(),
                total_trades: m.trades,
                won_trades: m.won_trades,
                avg_profit: m.trades > 0 ? Math.round(m.daily_profit / m.trades * 100) / 100 : 0,
                max_drawdown: Math.round(maxDrawdown * 10) / 10,
                current_risk: Math.round(currentRisk * 10) / 10,
                runtime_ms: runtimeMs,
                events: this.eventLog.slice(-20)
            };
        }
    }
    handleRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        if (req.url === '/api/metrics' || req.url === '/metrics') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.metrics));
            return;
        }
        if (req.url === '/' || req.url === '/dashboard') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.getHtmlDashboard());
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    }
    updateFromBot(report, compounding) {
        const capital = compounding?.currentCapital || report?.capital || 500;
        const dailyProfit = compounding?.dailyProfit || 0;
        const tier = compounding?.currentTier || 1;
        const scaling = capital / 500;
        const maxDrawdown = this.maxEquity > 0 ? ((this.maxEquity - this.minEquity) / this.maxEquity) * 100 : 0;
        const currentRisk = this.maxEquity > 0 ? ((this.maxEquity - capital) / this.maxEquity) * 100 : 0;
        this.metrics = {
            timestamp: Date.now(),
            cycle: report?.cycle || this.metrics.cycle,
            capital: Number(capital.toFixed(2)),
            daily_profit: Number(dailyProfit.toFixed(2)),
            hourly_profit: Number((compounding?.hourlyProfit || 0).toFixed(2)),
            total_profit: Number((report?.total_profit || 0).toFixed(2)),
            win_rate: this.metrics.win_rate,
            profit_factor: this.metrics.profit_factor,
            fill_rate: this.metrics.fill_rate,
            tier,
            scaling_multiplier: Number(Math.sqrt(capital / 500).toFixed(2)),
            tier_progress: this.calculateTierProgress(tier, capital),
            trades_per_hour: this.metrics.trades_per_hour,
            status: 'Live • Compounding Daily',
            equity_history: this.equityHistory.slice(-50),
            total_trades: this.metrics.total_trades,
            won_trades: this.metrics.won_trades,
            avg_profit: this.metrics.avg_profit,
            max_drawdown: Math.round(maxDrawdown * 10) / 10,
            current_risk: Math.round(currentRisk * 10) / 10,
            runtime_ms: Date.now() - this.startTime,
            events: this.eventLog.slice(-20)
        };
    }
    calculateTierProgress(tier, capital) {
        const targets = [0, 5000, 25000, 100000];
        const currentTarget = targets[tier] || targets[3];
        const prevTarget = targets[tier - 1] || 500;
        return Math.min(100, ((capital - prevTarget) / (currentTarget - prevTarget)) * 100);
    }
    getHtmlDashboard() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BTC 5-Min Bot • Daily Compounding</title>
  <style>
    :root {
      --bg: #1a1200;
      --panel: rgba(40, 30, 10, 0.85);
      --text: #fff8e7;
      --muted: #c0a080;
      --profit: #f59e0b;
      --loss: #ef4444;
      --accent: #fbbf24;
      --btc-gold: #f7931a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(180deg, #08111d, #0a1424); color: var(--text); font-family: 'SF Mono', 'Fira Code', monospace; padding: 20px; }
    .container { max-width: 1600px; margin: 0 auto; }
    h1 { font-size: 2rem; background: linear-gradient(135deg, #f7931a, #fbbf24); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
    .status-bar { display: flex; gap: 20px; align-items: center; margin-bottom: 24px; padding: 12px 16px; background: var(--panel); border-radius: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--profit); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--panel); border-radius: 12px; padding: 20px; border: 1px solid rgba(247,147,26,0.2); }
    .card h3 { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card .value { font-size: 2rem; font-weight: 700; }
    .card .sub { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
    .card.profit .value { color: var(--profit); }
    .card.loss .value { color: var(--loss); }

    .chart-container { background: var(--panel); border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid rgba(247,147,26,0.2); }
    .chart-container h3 { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    #equity-chart { width: 100%; height: 200px; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stat { text-align: center; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px; }
    .stat .label { color: var(--muted); font-size: 0.7rem; text-transform: uppercase; }
    .stat .num { font-size: 1.5rem; font-weight: 600; margin-top: 4px; }

    .events { background: var(--panel); border-radius: 12px; padding: 20px; max-height: 300px; overflow-y: auto; border: 1px solid rgba(247,147,26,0.2); }
    .events h3 { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    #events { font-size: 0.85rem; line-height: 1.6; }
    .event { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .event.win { color: var(--profit); }
    .event.loss { color: var(--loss); }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-bar">
      <div class="status-dot"></div>
      <span id="status">Live • Compounding Daily</span>
      <span style="color:var(--muted);font-size:0.85rem;" id="runtime">0:00:00</span>
      <span style="margin-left:auto;color:var(--muted);font-size:0.85rem;">Cycle <span id="cycle">0</span></span>
    </div>

    <h1>BTC 5-Min Bot</h1>
    <p style="color:var(--muted);margin-bottom:24px;">Daily Compounding • Live Trading</p>

    <div class="grid">
      <div class="card profit">
        <h3>Capital</h3>
        <div class="value" id="capital">$500.00</div>
        <div class="sub" id="capital-sub">Tier 1 • √1.0x order scale</div>
      </div>
      <div class="card profit">
        <h3>Daily P&L</h3>
        <div class="value" id="daily">$0.00</div>
        <div class="sub" id="daily-pct">+0.00%</div>
      </div>
      <div class="card profit">
        <h3>Hourly P&L</h3>
        <div class="value" id="hourly">$0.00</div>
        <div class="sub">Current hour earnings</div>
      </div>
      <div class="card">
        <h3>Total P&L</h3>
        <div class="value" id="total">$0.00</div>
      </div>
      <div class="card">
        <h3>Tier</h3>
        <div class="value" id="tier">1</div>
        <div class="sub" id="tier-info">Next: $5,000</div>
      </div>
    </div>

    <div class="chart-container">
      <h3>Equity Curve</h3>
      <canvas id="equity-chart"></canvas>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="label">Win Rate</div><div class="num" id="win-rate">0%</div></div>
      <div class="stat"><div class="label">Total Trades</div><div class="num" id="total-trades">0</div></div>
      <div class="stat"><div class="label">Won</div><div class="num" id="won-trades">0</div></div>
      <div class="stat"><div class="label">Avg Profit</div><div class="num" id="avg-profit">$0</div></div>
      <div class="stat"><div class="label">Max Drawdown</div><div class="num" id="max-dd">0%</div></div>
      <div class="stat"><div class="label">Risk</div><div class="num" id="risk">0%</div></div>
      <div class="stat"><div class="label">Trades/Hr</div><div class="num" id="trades/hr">0</div></div>
      <div class="stat"><div class="label">Fill Rate</div><div class="num" id="fill-rate">0%</div></div>
    </div>

    <div class="events">
      <h3>Live Events</h3>
      <div id="events"></div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('equity-chart');
    const ctx = canvas.getContext('2d');
    let equityData = [];
    let lastEventCount = 0;

    function resizeCanvas() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function drawChart(data) {
      if (!data || data.length < 2) return;
      const w = canvas.width;
      const h = canvas.height;

      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min || 1;
      const padding = range * 0.1;

      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

      ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((val - min + padding) / (range + padding * 2)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((val - min + padding) / (range + padding * 2)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (data.length > 0) {
        const lastX = w;
        const lastY = h - ((data[data.length - 1] - min + padding) / (range + padding * 2)) * h;

        ctx.beginPath();
        ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#07111f';
        ctx.fill();
      }

      ctx.fillStyle = '#95a8c7';
      ctx.font = '10px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('$' + max.toFixed(0), 5, 12);
      ctx.fillText('$' + min.toFixed(0), 5, h - 5);
    }

    async function update() {
      try {
        const r = await fetch('/api/metrics');
        const d = await r.json();

        document.getElementById('capital').textContent = '$' + Number(d.capital).toFixed(2);
        document.getElementById('daily').textContent = '$' + Number(d.daily_profit).toFixed(2);
        document.getElementById('hourly').textContent = '$' + Number(d.hourly_profit).toFixed(2);
        document.getElementById('total').textContent = '$' + Number(d.total_profit).toFixed(2);
        document.getElementById('tier').textContent = d.tier;
        document.getElementById('cycle').textContent = d.cycle;
        document.getElementById('status').textContent = d.status;

        const ms = d.runtime_ms || 0;
        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        document.getElementById('runtime').textContent = hrs + ':' + String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');

        const pct = d.capital > 0 ? (d.daily_profit / d.capital * 100).toFixed(2) : 0;
        document.getElementById('daily-pct').textContent = (d.daily_profit >= 0 ? '+' : '') + pct + '%';

        const tierNext = [500, 5000, 25000, 100000];
        document.getElementById('tier-info').textContent = 'Next: $' + tierNext[d.tier]?.toLocaleString();
        document.getElementById('capital-sub').textContent = 'Tier ' + d.tier + ' • √' + d.scaling_multiplier + 'x order scale';

        document.getElementById('win-rate').textContent = d.win_rate + '%';
        document.getElementById('total-trades').textContent = d.total_trades;
        document.getElementById('won-trades').textContent = d.won_trades;
        document.getElementById('avg-profit').textContent = '$' + d.avg_profit;
        document.getElementById('max-dd').textContent = d.max_drawdown + '%';
        document.getElementById('risk').textContent = d.current_risk + '%';
        document.getElementById('trades/hr').textContent = d.trades_per_hour;
        document.getElementById('fill-rate').textContent = d.fill_rate + '%';

        if (d.equity_history && d.equity_history.length > 0) {
          equityData = d.equity_history;
          drawChart(equityData);
        }

        if (d.events && d.events.length > 0) {
          const eventsEl = document.getElementById('events');
          eventsEl.innerHTML = d.events.map(e =>
            '<div class="event">' + e + '</div>'
          ).join('');
        }

      } catch(e) { console.error(e); }
    }

    setInterval(update, 1000);
    update();
  </script>
</body>
</html>`;
    }
    close() {
        this.server.close();
    }
}
exports.DashboardServer = DashboardServer;
//# sourceMappingURL=dashboard-server.js.map