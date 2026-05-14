import dotenv from 'dotenv';
import { createDemoBot } from './demo-simulator';
import { DashboardServer } from './dashboard-server';
import { DashboardMetricsStore } from './metrics';

dotenv.config();

async function main() {
  process.env.DEMO_MODE = 'true';

  const metrics = new DashboardMetricsStore();
  const port = Number(process.env.DASHBOARD_PORT || '3000');
  const durationMs = Number(process.env.DEMO_DURATION_MS || '86400000');
  const server = new DashboardServer(port, metrics);

  const bot = createDemoBot(metrics);

  console.log(`🧪 Starting 24h-style BTC demo session for ${(durationMs / 3_600_000).toFixed(2)}h`);

  const runPromise = bot.runFor(durationMs).then(() => {
    console.log('✅ Demo session finished');
    server.close();
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping dashboard and demo...');
    server.close();
  });

  await runPromise;
}

void main().catch((error) => {
  console.error('Dashboard runner failed:', error);
  process.exit(1);
});
