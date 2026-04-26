"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const btc_bot_1 = require("./btc-bot");
const test_runner_1 = require("./test-runner");
dotenv_1.default.config();
async function main() {
    const isDemoMode = process.env.DEMO_MODE === 'true' ||
        process.env.NETWORK === 'demo' ||
        process.env.PRIVATE_KEY === 'your_demo_private_key_here';
    if (isDemoMode) {
        await (0, test_runner_1.runDemo)();
        return;
    }
    const marketId = process.env.MARKET_ID;
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) {
        console.error('PRIVATE_KEY not set in .env');
        process.exit(1);
    }
    if (!marketId) {
        console.error('MARKET_ID not set in .env');
        process.exit(1);
    }
    const bot = new btc_bot_1.BTC5MinBot(marketId, PRIVATE_KEY);
    await bot.start();
}
void main().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map