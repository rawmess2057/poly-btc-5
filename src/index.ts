import dotenv from 'dotenv';
import { BTC5MinBot } from './btc-bot';
import { runDemo } from './test-runner';

dotenv.config();

async function main() {
  const isDemoMode =
    process.env.DEMO_MODE === 'true' ||
    process.env.NETWORK === 'demo' ||
    process.env.PRIVATE_KEY === 'your_demo_private_key_here';

  if (isDemoMode) {
    await runDemo();
    return;
  }

  const marketId = process.env.MARKET_ID;
  const PRIVATE_KEY = process.env.PRIVATE_KEY!;

  if (!PRIVATE_KEY) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  if (!marketId) {
    console.error('MARKET_ID not set in .env');
    process.exit(1);
  }

  const bot = new BTC5MinBot(marketId, PRIVATE_KEY);
  await bot.start();
}

void main().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
