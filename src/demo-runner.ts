// src/test-runner.ts
import dotenv from 'dotenv';
import { createDemoBot } from './demo-simulator';
import { DashboardMetricsStore } from './metrics';

dotenv.config();

export async function runDemo() {
  const demoDurationMs = Number(process.env.DEMO_DURATION_MS || '86400000');

  console.log('🧪 Starting BTC 5-minute bot demo...\n');

  const metrics = new DashboardMetricsStore();
  const bot = createDemoBot(metrics);

  await bot.runFor(demoDurationMs);

  console.log('\n✅ Demo finished successfully');
}

if (require.main === module) {
  void runDemo().catch((error) => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
}