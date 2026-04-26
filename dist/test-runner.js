"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDemo = runDemo;
const dotenv_1 = __importDefault(require("dotenv"));
const demo_simulator_1 = require("./demo-simulator");
const metrics_1 = require("./metrics");
dotenv_1.default.config();
async function runDemo() {
    const demoDurationMs = Number(process.env.DEMO_DURATION_MS || '86400000');
    const metrics = new metrics_1.DashboardMetricsStore();
    const bot = (0, demo_simulator_1.createDemoBot)(metrics);
    console.log('🧪 Starting local BTC 5-minute bot demo\n');
    await bot.runFor(demoDurationMs);
    console.log('\n✅ Demo finished successfully');
}
if (require.main === module) {
    void runDemo().catch((error) => {
        console.error('❌ Demo failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=test-runner.js.map